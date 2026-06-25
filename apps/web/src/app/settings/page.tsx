"use client";

import { useMe } from "@/lib/hooks";

// NON-BYOK: pengguna TIDAK lagi memasukkan API key sendiri. Seluruh app
// berbagi satu langganan OpenCode Go yang dikonfigurasi di server (env).
// Karena itu form kredensial AI / Codex dihapus dari halaman ini.
export default function SettingsPage() {
  const me = useMe();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Pengaturan</h1>

      <section className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="mb-2 font-medium text-emerald-800">Penyedia AI: OpenCode Go</h2>
        <p className="text-sm text-emerald-900">
          Aplikasi ini <strong>bukan BYOK</strong>. Anda tidak perlu — dan tidak
          dapat — memasukkan API key sendiri. Semua fitur AI (analisis paper &
          Asisten AI) memakai satu langganan OpenCode Go yang dikelola di server.
        </p>
        <p className="mt-2 text-sm text-emerald-900">
          Kuota dibagi bersama seluruh pengguna, jadi mohon gunakan secukupnya.
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-3 font-medium">Akun</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd>{(me.data as any)?.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Bahasa</dt>
            <dd>{(me.data as any)?.preferredLanguage ?? "—"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
