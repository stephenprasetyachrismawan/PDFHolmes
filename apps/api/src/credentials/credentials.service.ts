import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { aiCredentials } from "../db/schema";
import { CryptoService } from "../crypto/crypto.service";
import type { AiProvider, AiAuthType } from "@pdfholmes/shared-types";

interface CreateCred {
  provider: AiProvider;
  authType: AiAuthType;
  label?: string;
  secret: string; // API key ATAU isi auth.json Codex
  model?: string;
  baseUrl?: string;
  isDefault?: boolean;
}

@Injectable()
export class CredentialsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly crypto: CryptoService,
  ) {}

  async list(userId: string) {
    const rows = await this.db
      .select()
      .from(aiCredentials)
      .where(eq(aiCredentials.userId, userId));
    // JANGAN pernah kembalikan secret (§16) — hanya metadata.
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      authType: r.authType,
      label: r.label,
      model: r.model,
      baseUrl: r.baseUrl,
      isDefault: r.isDefault,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async create(userId: string, input: CreateCred) {
    const { ciphertext, nonce } = this.crypto.encrypt(input.secret);

    if (input.isDefault) await this.clearDefault(userId);

    const [row] = await this.db
      .insert(aiCredentials)
      .values({
        userId,
        provider: input.provider,
        authType: input.authType,
        label: input.label ?? null,
        secretCiphertext: ciphertext,
        secretNonce: nonce,
        model: input.model ?? null,
        baseUrl: input.baseUrl ?? null,
        isDefault: input.isDefault ?? false,
      })
      .returning();

    return { id: row.id, isDefault: row.isDefault };
  }

  async setDefault(userId: string, id: string) {
    await this.clearDefault(userId);
    const [row] = await this.db
      .update(aiCredentials)
      .set({ isDefault: true })
      .where(and(eq(aiCredentials.id, id), eq(aiCredentials.userId, userId)))
      .returning();
    if (!row) throw new NotFoundException("kredensial tidak ditemukan");
    return { ok: true };
  }

  async remove(userId: string, id: string) {
    const [row] = await this.db
      .delete(aiCredentials)
      .where(and(eq(aiCredentials.id, id), eq(aiCredentials.userId, userId)))
      .returning();
    if (!row) throw new NotFoundException("kredensial tidak ditemukan");
    return { ok: true };
  }

  private async clearDefault(userId: string) {
    await this.db
      .update(aiCredentials)
      .set({ isDefault: false })
      .where(and(eq(aiCredentials.userId, userId), eq(aiCredentials.isDefault, true)));
  }
}
