"use client";

import { useState } from "react";
import { useCodexDeviceStart, useCodexDeviceStatus } from "@/lib/hooks";

// Login ChatGPT via device-flow (§8.2): tampilkan URL+kode, polling sampai selesai.
export function CodexDeviceLogin({ model }: { model?: string }) {
  const start = useCodexDeviceStart();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const status = useCodexDeviceStatus(sessionId);
  const s = status.data;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 text-xs text-amber-800">
        ⚠️ Memakai langganan ChatGPT Anda (bukan tagihan API). Untuk pemakaian
        personal/self-host — lihat catatan ToS (§8.3).
      </p>

      {!sessionId && (
        <button
          onClick={() =>
            start.mutate(
              { makeDefault: true, model },
              { onSuccess: (r) => setSessionId(r.sessionId) },
            )
          }
          disabled={start.isPending}
          className="rounded bg-brand px-4 py-2 text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {start.isPending ? "Memulai…" : "Login dengan ChatGPT (device)"}
        </button>
      )}

      {sessionId && s?.status === "pending" && (
        <div className="space-y-2 text-sm">
          <p>1. Buka tautan ini di browser:</p>
          <a
            href={s.verificationUri ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="block break-all font-medium text-brand underline"
          >
            {s.verificationUri}
          </a>
          <p>2. Masukkan kode:</p>
          <code className="inline-block rounded bg-white px-3 py-1.5 text-lg font-bold tracking-widest">
            {s.userCode}
          </code>
          <p className="text-slate-500">Menunggu persetujuan…</p>
        </div>
      )}

      {sessionId && (s?.status === "starting" || status.isLoading) && (
        <p className="text-sm text-slate-500">Menyiapkan login…</p>
      )}

      {s?.status === "complete" && (
        <p className="text-sm font-medium text-emerald-700">
          ✓ Tersambung. Kredensial Codex tersimpan & dijadikan default.
        </p>
      )}

      {s?.status === "error" && (
        <div className="text-sm text-red-600">
          <p>Gagal: {s.error}</p>
          <button
            onClick={() => setSessionId(null)}
            className="mt-1 underline"
          >
            Coba lagi
          </button>
        </div>
      )}
    </div>
  );
}
