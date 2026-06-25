import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type Redis from "ioredis";
import { DB, type Database } from "../db/db.module";
import { aiUsage, type DbUser } from "../db/schema";
import { REDIS } from "../redis/redis.tokens";
import { config } from "../config";

export interface ChatResult {
  ok: true;
  model: string;
  content: string;
}

// Hasil normalisasi: SELALU bentuk { ok, model, content }.
// CATATAN KEAMANAN: API key OpenCode Go tak pernah keluar dari service ini —
// tidak ditaruh di response, log, atau pesan error.
@Injectable()
export class AiService {
  private readonly log = new Logger("AiService");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async chat(user: DbUser, rawPrompt: string): Promise<ChatResult> {
    const oc = config.opencode;

    // 1) Validasi konfigurasi server (jangan bocorkan detail ke klien).
    if (!oc.apiKey) {
      this.log.error("OPENCODE_GO_API_KEY belum diset di environment server");
      throw new ServiceUnavailableException("Layanan AI belum dikonfigurasi.");
    }

    // 2) Sanitasi input: trim + batasi panjang.
    const prompt = (rawPrompt ?? "").trim();
    if (!prompt) throw new BadRequestException("Prompt kosong.");
    if (prompt.length > oc.maxInputChars) {
      throw new BadRequestException(
        `Prompt terlalu panjang (maks ${oc.maxInputChars} karakter).`,
      );
    }

    // 3) Rate limit: per-user lalu global (lindungi kuota langganan bersama).
    await this.enforceRateLimit(`ai:rl:user:${user.id}`, oc.userRatePerMin, user.id);
    await this.enforceRateLimit("ai:rl:global", oc.globalRatePerMin, user.id);

    // 4) Forward ke OpenCode Go (retry sekali utk error jaringan transien).
    const startedAt = Date.now();
    try {
      const content = await this.callOpencode(prompt);
      await this.recordUsage(user.id, prompt.length, "ok", Date.now() - startedAt);
      return { ok: true, model: oc.model, content };
    } catch (err) {
      await this.recordUsage(user.id, prompt.length, "error", Date.now() - startedAt);
      // Pesan bersih ke klien; detail mentah hanya di log server (tanpa prompt).
      if (err instanceof HttpException) throw err;
      this.log.error(`OpenCode Go gagal: ${(err as Error).message}`);
      throw new ServiceUnavailableException("Layanan AI sedang tidak tersedia.");
    }
  }

  // ─────────────────────── OpenCode Go HTTP ───────────────────────
  private async callOpencode(prompt: string): Promise<string> {
    const oc = config.opencode;
    const isAnthropic = oc.providerType === "anthropic";
    const url = isAnthropic
      ? `${oc.baseUrl}/v1/messages`
      : `${oc.baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${oc.apiKey}`,
      "Content-Type": "application/json",
    };
    if (isAnthropic) headers["anthropic-version"] = "2023-06-01";

    const body = isAnthropic
      ? {
          model: oc.model,
          max_tokens: oc.maxTokens,
          messages: [{ role: "user", content: prompt }],
        }
      : {
          model: oc.model,
          max_tokens: oc.maxTokens,
          messages: [{ role: "user", content: prompt }],
        };

    // Retry SEKALI saja, hanya utk error jaringan transien (bukan 4xx/5xx HTTP).
    let lastNetworkErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), oc.timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          // Konsumsi body agar koneksi bebas; JANGAN echo ke klien (bisa berisi detail).
          const detail = await res.text().catch(() => "");
          this.log.warn(`OpenCode Go HTTP ${res.status}: ${detail.slice(0, 300)}`);
          if (res.status === 429) {
            throw new HttpException("Kuota AI sedang penuh, coba lagi nanti.", 429);
          }
          throw new ServiceUnavailableException("Layanan AI menolak permintaan.");
        }

        const json = (await res.json()) as unknown;
        return this.extractContent(json, isAnthropic);
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof HttpException) throw err; // 4xx/5xx -> jangan retry
        lastNetworkErr = err; // timeout/abort/jaringan -> boleh retry sekali
        this.log.warn(`OpenCode Go percobaan ${attempt + 1} gagal jaringan`);
      }
    }
    throw lastNetworkErr ?? new Error("network error");
  }

  // Normalisasi respons anthropic vs openai -> string konten.
  private extractContent(json: any, isAnthropic: boolean): string {
    if (isAnthropic) {
      const parts = Array.isArray(json?.content) ? json.content : [];
      const text = parts.map((p: any) => p?.text ?? "").join("").trim();
      return text || "(tidak ada balasan)";
    }
    const text = json?.choices?.[0]?.message?.content;
    return (typeof text === "string" ? text.trim() : "") || "(tidak ada balasan)";
  }

  // ─────────────────────── Rate limit (Redis) ───────────────────────
  // INCR + EXPIRE pada window 60 dtk. Aman antar-instance (terpusat di Redis).
  private async enforceRateLimit(key: string, limit: number, userId: string) {
    if (limit <= 0) return;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    if (count > limit) {
      await this.recordUsage(userId, 0, "rate_limited", 0).catch(() => undefined);
      throw new HttpException("Terlalu banyak permintaan AI. Coba lagi sebentar.", 429);
    }
  }

  // ─────────────────────── Audit pemakaian ───────────────────────
  private async recordUsage(
    userId: string,
    inputLength: number,
    status: string,
    latencyMs: number,
  ) {
    try {
      await this.db.insert(aiUsage).values({ userId, model: config.opencode.model, inputLength, status, latencyMs });
    } catch (err) {
      this.log.warn(`gagal mencatat ai_usage: ${(err as Error).message}`);
    }
  }
}
