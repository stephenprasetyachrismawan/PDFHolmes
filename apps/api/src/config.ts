// Konfigurasi terpusat dari env. Gagal cepat bila yang wajib hilang (prod).
export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  get isProd() {
    return this.nodeEnv === "production";
  },
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // IAM auth ke RDS/Aurora (mis. cluster free/express yg memaksa IAM). Bila true,
  // password di DATABASE_URL diabaikan; token IAM 15-menit dibuat per koneksi.
  dbIamAuth: process.env.DB_IAM_AUTH === "true",
  dbIamRegion:
    process.env.DB_IAM_REGION ?? process.env.AWS_REGION ?? process.env.COGNITO_REGION ?? "ap-southeast-1",
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

  // ─────────────────────────────────────────────────────────────
  // OpenCode Go — penyedia AI tunggal sisi-server (NON-BYOK).
  // API key HANYA dibaca di backend; tak pernah dibocorkan ke browser,
  // bundle frontend, log, response JSON, atau pesan error.
  // ─────────────────────────────────────────────────────────────
  opencode: {
    apiKey: process.env.OPENCODE_GO_API_KEY ?? "",
    model: process.env.OPENCODE_GO_MODEL ?? "minimax-m2.7",
    // "anthropic" -> POST /v1/messages ; "openai" -> POST /v1/chat/completions
    providerType: (process.env.OPENCODE_GO_PROVIDER_TYPE ?? "anthropic") as
      | "anthropic"
      | "openai",
    baseUrl: (process.env.OPENCODE_GO_BASE_URL ?? "https://opencode.ai/zen/go").replace(
      /\/+$/,
      "",
    ),
    // Batas keamanan / kuota.
    maxTokens: Number(process.env.OPENCODE_GO_MAX_TOKENS ?? 2000),
    maxInputChars: Number(process.env.OPENCODE_GO_MAX_INPUT_CHARS ?? 8000),
    timeoutMs: Number(process.env.OPENCODE_GO_TIMEOUT_MS ?? 60_000),
    // Rate limit: per-user & global (lindungi kuota langganan bersama).
    userRatePerMin: Number(process.env.OPENCODE_GO_USER_RATE_PER_MIN ?? 20),
    globalRatePerMin: Number(process.env.OPENCODE_GO_GLOBAL_RATE_PER_MIN ?? 300),
  },
};

export function assertProdConfig() {
  // KEAMANAN: dev-bypass DILARANG di produksi (akan membuka app tanpa auth).
  if (config.isProd && config.authDevBypass) {
    throw new Error("AUTH_DEV_BYPASS=true terlarang saat NODE_ENV=production");
  }
  // KEAMANAN: app NON-BYOK -> OpenCode Go API key WAJIB ada di prod.
  if (config.isProd && !config.opencode.apiKey) {
    throw new Error("OPENCODE_GO_API_KEY wajib diset di produksi (app non-BYOK)");
  }
  if (config.authDevBypass) return; // dev: lewati cek Cognito
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.cognito.jwksUrl) missing.push("COGNITO_JWKS_URL");
  if (!config.cognito.issuer) missing.push("COGNITO_ISSUER");
  if (missing.length) {
    throw new Error(`Config wajib hilang: ${missing.join(", ")}`);
  }
}
