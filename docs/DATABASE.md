# Database — Aurora PostgreSQL (IAM Auth)

PDFHo!mes menyimpan datanya di **Amazon Aurora Serverless v2 (PostgreSQL 17)**
dengan ekstensi **pgvector**. Akses memakai **IAM database authentication**: tidak
ada password statis — aplikasi membuat token IAM 15 menit setiap koneksi, lewat TLS.

Kenapa begini: kredensial database tidak pernah disimpan di file. Yang dipakai
adalah identitas IAM dari **instance role EC2** (`pdfholmes-ec2`, dengan policy
`pdfholmes-rds-connect`). Aurora juga managed — ada backup otomatis dan auto-pause
saat idle (Serverless v2, min ACU 0).

---

## Konfigurasi

Tiga baris di `.env`:

```env
DATABASE_URL=postgres://app@<cluster-endpoint>:5432/pdfholmes
DB_IAM_AUTH=true
DB_IAM_REGION=ap-southeast-1
```

- **Tidak ada password** di `DATABASE_URL` — user `app` memakai token IAM.
- User `app` di Aurora adalah anggota role **`rds_iam`** dan `LOGIN`.
- `DB_IAM_AUTH=true` membuat `api`, `extractor`, `analyzer`, dan `migrate`
  menghasilkan token IAM via `@aws-sdk/rds-signer` dan menyambung dengan SSL
  (`apps/api/src/db/db.module.ts`, `db/migrate.mjs`).

Kredensial AWS diambil otomatis dari instance role EC2 (rantai kredensial default
SDK lewat IMDS) — tidak perlu menaruh access key di mana pun.

---

## Cara dijalankan

Stack produksi memakai compose dasar saja (tanpa override) — database eksternal,
jadi tidak ada container Postgres:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d
```

Service `migrate` jalan lebih dulu, menyambung ke Aurora via IAM, dan menerapkan
file di `db/migrations/` (membuat tabel + ekstensi `vector`/`pgcrypto`). Idempoten —
yang sudah diterapkan akan di-skip.

Verifikasi:

```bash
curl https://pdfholmes.stevewithcode.net/api/health/ready   # {"db":"ok","redis":"ok"}
```

---

## Tabel inti

| Tabel | Isi |
|---|---|
| `users` | Pengguna (sinkron dari Cognito) + nama bucket MinIO-nya |
| `folders` | Folder bertingkat milik pengguna |
| `documents` | Metadata PDF + status siklus hidup |
| `extractions` | Hasil parser: `full_text`, `sections`, `metadata` (1:1 ke documents) |
| `analyses` | Satu sesi analisis (bahasa, model) |
| `analysis_sections` | 48 field hasil + `embedding` (pgvector) |
| `ai_usage` | Audit pemakaian AI (tanpa prompt, tanpa key) |
| `_migrations` | Catatan migrasi yang sudah diterapkan |

---

## Provisioning

Cluster Aurora disiapkan dengan IAM auth aktif, user `app` (anggota `rds_iam`),
database `pdfholmes`, dan instance role EC2 yang punya `rds-db:connect`. Setelah itu
schema dibuat oleh service `migrate`. Untuk membangun ulang dari nol:

```sql
-- sebagai master (lewat token IAM, sslmode=require):
CREATE DATABASE pdfholmes;
\c pdfholmes
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE ROLE app LOGIN;
GRANT rds_iam TO app;
GRANT ALL PRIVILEGES ON DATABASE pdfholmes TO app;
```

Lalu jalankan service `migrate` untuk tabelnya.

---

## Backup & operasional

- **Backup**: Aurora punya snapshot otomatis (retensi sesuai setelan cluster) plus
  point-in-time recovery. Snapshot manual via konsol RDS bila perlu.
- **Auto-pause**: min ACU 0 → cluster tidur saat idle; koneksi pertama setelah idle
  butuh ~15 detik untuk bangun. Untuk menghindari cold start, set min ACU `0.5`.
- **Migrasi baru**: tambah `db/migrations/000X_nama.sql`, lalu jalankan ulang
  service `migrate`.
- **Konek manual** (debug): buat token IAM lalu pakai sebagai password —
  ```bash
  TOKEN=$(aws rds generate-db-auth-token --hostname <endpoint> --port 5432 \
    --username app --region ap-southeast-1)
  PGPASSWORD="$TOKEN" psql "host=<endpoint> user=app dbname=pdfholmes sslmode=require"
  ```
