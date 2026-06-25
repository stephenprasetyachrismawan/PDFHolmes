// Klien fetch ke `api` (NestJS). Menyertakan Bearer token dari sesi Auth.js.
// DEV bypass: kirim header x-dev-user alih-alih Bearer.
"use client";

import { useSession } from "next-auth/react";
import { useCallback, useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DEV_BYPASS = process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS === "true";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function useApi() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken as string | undefined;
  const devEmail = (session?.user?.email as string | undefined) ?? "dev@pdfholmes.local";

  const request = useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (!headers.has("Content-Type") && init.body) {
        headers.set("Content-Type", "application/json");
      }
      if (DEV_BYPASS) headers.set("x-dev-user", devEmail);
      else if (token) headers.set("Authorization", `Bearer ${token}`);

      const res = await fetch(`${API_URL}${path}`, { ...init, headers });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new ApiError(res.status, text || res.statusText);
      }
      if (res.status === 204) return undefined as T;
      const ct = res.headers.get("content-type") ?? "";
      return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
    },
    [token, devEmail],
  );

  // Query string auth utk SSE EventSource (tak bisa kirim header).
  const sseToken = DEV_BYPASS
    ? `?x-dev-user=${encodeURIComponent(devEmail)}`
    : token
      ? `?access_token=${encodeURIComponent(token)}`
      : "";

  return useMemo(() => ({ request, apiUrl: API_URL, sseToken }), [request, sseToken]);
}
