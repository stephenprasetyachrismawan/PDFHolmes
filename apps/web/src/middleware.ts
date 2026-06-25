// Proteksi rute terautentikasi (prod). Saat AUTH_DEV_BYPASS, lewati semua.
// Auth.js v5: `auth` membungkus middleware & menyediakan req.auth.
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const DEV_BYPASS = process.env.AUTH_DEV_BYPASS === "true";

// Rute yang butuh login.
const PROTECTED = ["/library", "/settings", "/documents"];

export default auth((req) => {
  if (DEV_BYPASS) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname.startsWith(p));
  if (needsAuth && !req.auth) {
    const url = new URL("/", req.nextUrl.origin);
    url.searchParams.set("signin", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  // Jangan jalankan middleware utk asset statis & rute auth Next.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
