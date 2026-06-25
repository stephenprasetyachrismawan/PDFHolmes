import { AiChat } from "@/components/AiChat";

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <h1 className="mb-3 text-2xl font-semibold">Asisten AI</h1>
      <p className="mb-4 text-sm text-slate-500">
        Ditenagai OpenCode Go (langganan bersama sisi-server). Anda tidak perlu
        memasukkan API key apa pun.
      </p>
      <div className="flex-1 overflow-hidden rounded-lg border bg-slate-50">
        <AiChat />
      </div>
    </div>
  );
}
