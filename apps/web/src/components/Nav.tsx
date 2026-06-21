"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

const DEV_BYPASS = process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS === "true";

export function Nav() {
  const { data: session, status } = useSession();
  const loggedIn = DEV_BYPASS || status === "authenticated";

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand">
          PDFHo<span className="text-slate-900">!</span>mes
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {loggedIn && (
            <>
              <Link href="/library" className="hover:text-brand">Pustaka</Link>
              <Link href="/settings" className="hover:text-brand">Pengaturan</Link>
            </>
          )}
          {DEV_BYPASS ? (
            <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
              DEV MODE
            </span>
          ) : loggedIn ? (
            <button onClick={() => signOut()} className="text-slate-600 hover:text-brand">
              Keluar ({session?.user?.email})
            </button>
          ) : (
            <button
              onClick={() => signIn("cognito")}
              className="rounded bg-brand px-3 py-1.5 text-white hover:bg-brand-dark"
            >
              Masuk
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
