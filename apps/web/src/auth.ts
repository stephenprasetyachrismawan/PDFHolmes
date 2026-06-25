// Auth.js v5 — provider OIDC Cognito (§11). Access token disimpan di sesi
// utk dipakai memanggil `api` (Bearer JWT). DEV bypass: lihat env AUTH_DEV_BYPASS.
import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";

const devBypass = process.env.AUTH_DEV_BYPASS === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: devBypass
    ? []
    : [
        Cognito({
          clientId: process.env.COGNITO_CLIENT_ID,
          clientSecret: process.env.COGNITO_CLIENT_SECRET,
          issuer: process.env.COGNITO_ISSUER,
        }),
      ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      // Simpan access/id token saat login pertama.
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Cognito JWT yg diverifikasi `api`: pakai id_token (punya email/aud client).
      (session as any).accessToken = token.idToken ?? token.accessToken;
      return session;
    },
  },
});
