import { Global, Module } from "@nestjs/common";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, PoolConfig } from "pg";
import { Signer } from "@aws-sdk/rds-signer";
import { config } from "../config";
import * as schema from "./schema";

export const DB = Symbol("DB");
export type Database = NodePgDatabase<typeof schema>;

// Bangun konfigurasi Pool. Mode default: connection string biasa (password statis).
// Mode IAM (DB_IAM_AUTH=true): password = token IAM 15-menit, dibuat ulang tiap
// koneksi baru (node-postgres memanggil fn password per-connection). Wajib SSL.
function buildPoolConfig(): PoolConfig {
  if (!config.dbIamAuth) {
    return { connectionString: config.databaseUrl };
  }
  const u = new URL(config.databaseUrl);
  const host = u.hostname;
  const port = Number(u.port || 5432);
  const user = decodeURIComponent(u.username);
  const database = u.pathname.replace(/^\//, "");
  const signer = new Signer({ hostname: host, port, username: user, region: config.dbIamRegion });
  return {
    host,
    port,
    user,
    database,
    // Token IAM kedaluwarsa ±15 menit -> buat baru tiap koneksi.
    password: () => signer.getAuthToken(),
    // IAM auth mewajibkan TLS. CA RDS tak diverifikasi penuh (cukup enkripsi).
    ssl: { rejectUnauthorized: false },
  };
}

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Database => {
        const pool = new Pool(buildPoolConfig());
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
