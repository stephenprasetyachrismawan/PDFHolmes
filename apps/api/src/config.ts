// Konfigurasi terpusat dari env. Gagal cepat bila yang wajib hilang (prod).
export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://redis:6379",

  cognito: {
    issuer: process.env.COGNITO_ISSUER ?? "",
    jwksUrl: process.env.COGNITO_JWKS_URL ?? "",
    clientId: process.env.COGNITO_CLIENT_ID ?? "",
    region: process.env.COGNITO_REGION ?? "ap-southeast-1",
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? "http://minio:9000",
    publicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT ?? "http://localhost:9000",
    accessKey: process.env.MINIO_ROOT_USER ?? "minioadmin",
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? "minioadmin",
    region: process.env.MINIO_REGION ?? "us-east-1",
  },

  // DEV: lewati verifikasi Cognito, pakai header x-dev-user (email).
  authDevBypass: process.env.AUTH_DEV_BYPASS === "true",

  defaultLanguage: process.env.DEFAULT_LANGUAGE ?? "id",
};

export function assertProdConfig() {
  if (config.authDevBypass) return;
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.cognito.jwksUrl) missing.push("COGNITO_JWKS_URL");
  if (!config.cognito.issuer) missing.push("COGNITO_ISSUER");
  if (missing.length) {
    throw new Error(`Config wajib hilang: ${missing.join(", ")}`);
  }
}
