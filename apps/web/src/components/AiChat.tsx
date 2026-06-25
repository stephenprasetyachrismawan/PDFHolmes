"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAiChat } from "@/lib/hooks";
import { ApiError } from "@/lib/api";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

// Chat UI sederhana (NON-BYOK). Frontend hanya kirim prompt ke /api/ai/chat.
// Tak ada input API key — key OpenCode Go hanya hidup di server.
export function AiChat() {
  const chat = useAiChat();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);

  function send() {
    const prompt = input.trim();
    if (!prompt || chat.isPending) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    chat.mutate(prompt, {
      onSuccess: (res) =>
        setMessages((m) => [...m, { role: "assistant", content: res.content }]),
      onError: (err) => {
        // Pesan aman ke pengguna; tak pernah memuat detail rahasia.
        const msg =
          err instanceof ApiError
            ? err.status === 429
              ? "Kuota AI sedang penuh. Coba lagi sebentar."
              : "Gagal menghubungi layanan AI."
            : "Terjadi kesalahan tak terduga.";
        setError(msg);
      },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-400">
            Mulai percakapan dengan asisten AI.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-brand text-white"
                : "mr-auto border bg-white text-slate-800"
            }`}
          >
            {m.role === "assistant" ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
          </div>
        ))}
        {chat.isPending && (
          <div className="mr-auto max-w-[80%] rounded-lg border bg-white px-4 py-2">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-300" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-300 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-300 [animation-delay:300ms]" />
            </div>
          </div>
        )}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>

      <div className="border-t bg-slate-50 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Tulis pesan… (Enter untuk kirim)"
            className="flex-1 resize-none rounded border px-3 py-2 text-sm"
          />
          <button
            onClick={send}
            disabled={!input.trim() || chat.isPending}
            className="self-end rounded bg-brand px-4 py-2 text-white hover:bg-brand-dark disabled:opacity-60"
          >
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}
