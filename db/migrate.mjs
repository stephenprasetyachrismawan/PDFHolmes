// Runner migrasi sederhana: jalankan file *.sql di db/migrations urut nama,
// catat yang sudah dipakai di tabel _migrations. Idempoten.
// Dipakai oleh service `migrate` (infra) atau `pnpm db:migrate`.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL tidak diset");
  process.exit(1);
}

// IAM auth (RDS/Aurora yg memaksa IAM): token 15-menit sbg password + SSL.
// Migrasi satu-kali -> cukup buat token sekali saat konek.
const DB_IAM_AUTH = process.env.DB_IAM_AUTH === "true";

async function buildClientConfig() {
  if (!DB_IAM_AUTH) return { connectionString: DATABASE_URL };
  const { Signer } = await import("@aws-sdk/rds-signer");
  const u = new URL(DATABASE_URL);
  const host = u.hostname;
  const port = Number(u.port || 5432);
  const user = decodeURIComponent(u.username);
  const database = u.pathname.replace(/^\//, "");
  const region =
    process.env.DB_IAM_REGION ?? process.env.AWS_REGION ?? process.env.COGNITO_REGION ?? "ap-southeast-1";
  const signer = new Signer({ hostname: host, port, username: user, region });
  const token = await signer.getAuthToken();
  return { host, port, user, database, password: token, ssl: { rejectUnauthorized: false } };
}

async function main() {
  const client = new Client(await buildClientConfig());
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows } = await client.query("SELECT name FROM _migrations");
    const done = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (done.has(file)) {
        console.log(`skip   ${file}`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`apply  ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations(name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migrasi gagal di ${file}: ${err.message}`);
      }
    }
    console.log("Migrasi selesai.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
