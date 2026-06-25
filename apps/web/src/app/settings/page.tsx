"use client";

import { useState } from "react";
import { useCredentials, useCreateCredential, useDeleteCredential } from "@/lib/hooks";
import { CodexDeviceLogin } from "@/components/CodexDeviceLogin";

type Provider = "openai" | "anthropic" | "google" | "openai_compatible" | "codex";

export default function SettingsPage() {
  const creds = useCredentials();
  const create = useCreateCredential();
  const del = useDeleteCredential();

  const [provider, setProvider] = useState<Provider>("openai");
  const [secret, setSecret] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [label, setLabel] = useState("");
  const [codexPaste, setCodexPaste] = useState(false); // fallback tempel auth.json

  const isCodex = provider === "codex";

  function submit() {
    if (!secret) return;
    create.mutate(
      {
        provider,
        authType: isCodex ? "oauth_codex" : "api_key",
        secret,
        model: model || undefined,
        baseUrl: provider === "openai_compatible" ? baseUrl || undefined : undefined,
        label: label || undefined,
        isDefault: (creds.data?.length ?? 0) === 0,
      },
      { onSuccess: () => { setSecret(""); setLabel(""); } },
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Pengaturan AI</h1>

      {/* Daftar kredensial */}
      <section className="mb-8">
        <h2 className="mb-3 font-medium">Kredensial tersimpan</h2>
        {creds.data && creds.data.length > 0 ? (
          <ul className="space-y-2">
            {creds.data.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded border bg-white p-3 text-sm"
              >
                <span>
                  <strong>{c.provider}</strong>
                  {c.model ? ` · ${c.model}` : ""}
                  {c.label ? ` · ${c.label}` : ""}
                  {c.isDefault && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs text-emerald-700">
                      default
                    </span>
                  )}
                </span>
                <button
                  onClick={() => del.mutate(c.id)}
                  className="text-red-600 hover:underline"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Belum ada kredensial.</p>
        )}
      </section>

      {/* Tambah kredensial */}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-4 font-medium">Tambah kredensial</h2>

        <label className="mb-3 block text-sm">
          Penyedia
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="mt-1 w-full rounded border px-2 py-1.5"
          >
            <option value="openai">OpenAI (API key)</option>
            <option value="anthropic">Anthropic (API key)</option>
            <option value="google">Google Gemini (API key)</option>
            <option value="openai_compatible">OpenAI-compatible (OpenRouter/Ollama…)</option>
            <option value="codex">Codex / ChatGPT subscription</option>
          </select>
        </label>

        {/* Model dipakai device-flow & manual */}
        <label className="mb-3 block text-sm">
          Model (opsional)
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={isCodex ? "gpt-5.1-codex" : "gpt-4o-mini / claude-3-5-sonnet-latest"}
            className="mt-1 w-full rounded border px-2 py-1.5"
          />
        </label>

        {/* Codex: device-flow login (§8.2) sebagai jalur utama */}
        {isCodex && !codexPaste && (
          <div className="mb-3">
            <CodexDeviceLogin model={model || undefined} />
            <button
              type="button"
              onClick={() => setCodexPaste(true)}
              className="mt-2 text-xs text-slate-500 underline"
            >
              atau tempel auth.json manual
            </button>
          </div>
        )}

        {/* Field manual: semua provider non-codex, atau codex mode tempel */}
        {(!isCodex || codexPaste) && (
          <>
            <label className="mb-3 block text-sm">
              {isCodex ? "Isi auth.json" : "API key"}
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={isCodex ? '{"tokens":{...}}' : "sk-…"}
                className="mt-1 w-full rounded border px-2 py-1.5"
              />
            </label>

            {provider === "openai_compatible" && (
              <label className="mb-3 block text-sm">
                Base URL
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                  className="mt-1 w-full rounded border px-2 py-1.5"
                />
              </label>
            )}

            <label className="mb-4 block text-sm">
              Label (opsional)
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5"
              />
            </label>

            <button
              onClick={submit}
              disabled={!secret || create.isPending}
              className="rounded bg-brand px-4 py-2 text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {create.isPending ? "Menyimpan…" : "Simpan (terenkripsi)"}
            </button>
            {isCodex && codexPaste && (
              <button
                type="button"
                onClick={() => setCodexPaste(false)}
                className="ml-3 text-xs text-slate-500 underline"
              >
                kembali ke device login
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
