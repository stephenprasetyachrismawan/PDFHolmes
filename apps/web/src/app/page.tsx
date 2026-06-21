"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";

const DEV_BYPASS = process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS === "true";

export default function Home() {
  const { status } = useSession();
  const loggedIn = DEV_BYPASS || status === "authenticated";

  // Diarahkan dari rute terproteksi (?signin=1) -> buka Hosted UI Cognito.
  // Baca query via window (client-only) agar tak butuh Suspense/prerender.
  useEffect(() => {
    if (DEV_BYPASS || status !== "unauthenticated") return;
    if (new URLSearchParams(window.location.search).get("signin") === "1") {
      signIn("cognito");
    }
  }, [status]);

  return (
    <div className="mx-auto max-w-3xl py-12 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        Interogasi paper riset Anda
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Unggah PDF artikel ilmiah → dapatkan <strong>48 field analisis terstruktur</strong>{" "}
        lengkap dengan deteksi <em>research gap</em>, dalam bahasa pilihan Anda.
      </p>
      <div className="mt-8">
        {loggedIn ? (
          <Link
            href="/library"
            className="rounded-lg bg-brand px-6 py-3 text-white hover:bg-brand-dark"
          >
            Buka Pustaka
          </Link>
        ) : (
          <button
            onClick={() => signIn("cognito")}
            className="rounded-lg bg-brand px-6 py-3 text-white hover:bg-brand-dark"
          >
            Mulai — Masuk dengan email
          </button>
        )}
      </div>
    </div>
  );
}
