# PDFHo!mes

Platform web membedah artikel riset (PDF) → analisis terstruktur 48 field + deteksi *research gap*, dalam bahasa pilihan pengguna.

Implementasi dari [`PDFHomes_Rencana_Arsitektur.md`](./PDFHomes_Rencana_Arsitektur.md).

## Arsitektur singkat

9 service via Docker Compose (satu jaringan, bukan container-in-container):

| Service | Stack | Peran |
|---|---|---|
| `web` | Next.js 15 + Auth.js | UI, login Cognito, PDF viewer, panel field |
| `api` | NestJS | BFF: verifikasi JWT, CRUD, presigned URL, enqueue, SSE |
| `extractor` | Python + PyMuPDF | PDF → teks/struktur (GROBID), simpan ke DB |
| `analyzer` | Python + OpenCode Go | per-field prompt → LLM → `analysis_sections` |
| `grobid` | lfoppiano/grobid | PDF ilmiah → TEI XML |
| `redis` | redis:7 | antrian job + cache |
| `minio` | minio | object storage (bucket per-user) |
| `proxy` | caddy:2 | TLS + routing |
| `db` (dev) | pgvector/pgvector:pg16 | Postgres lokal (prod: Aurora) |

Pipeline async: upload → `EXTRACT` (text parser → DB) → `ANALYZE` (OpenCode Go) → field tersaji (status via SSE).

## AI: OpenCode Go (NON-BYOK)

Aplikasi ini **bukan BYOK**. Pengguna **tidak** memasukkan API key sendiri.
Seluruh app berbagi **satu** langganan OpenCode Go yang dibaca dari env server
(`OPENCODE_GO_API_KEY`). Key hanya hidup di backend (`api` + `analyzer`) dan
tak pernah dikirim ke browser, bundle frontend, log, atau response.

- Analisis 48 field paper: extractor menyimpan hasil text parser ke DB, lalu
  analyzer mengirim (teks hasil parser + konteks PDF) ke OpenCode Go dan menulis
  hasilnya ke `analysis_sections` → tampil ke pengguna.
- Asisten AI (chat): frontend hanya mengirim prompt ke `POST /api/ai/chat`;
  backend yang memanggil OpenCode Go.

Panduan langganan, copy key, `.env`, dan penjelasan kuota bersama:
[`docs/OPENCODE.md`](./docs/OPENCODE.md).
Cognito dari nol: [`docs/COGNITO.md`](./docs/COGNITO.md).
Arsitektur detail (MinIO/DB/Cognito/OpenCode): [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Quick start (dev)

```bash
cp .env.example .env          # isi Cognito + OPENCODE_GO_API_KEY + secret
pnpm install                  # deps TS (web/api/packages)
pnpm compose:dev              # nyalakan semua service + db lokal
# migrasi DB dijalankan otomatis oleh service `migrate`
open http://localhost:3000
```

Tanpa Cognito sungguhan? Set `AUTH_DEV_BYPASS=true` di `.env` (lihat `apps/api`) untuk login dev tanpa AWS.

## Setup lengkap (produksi — agar bisa dipakai publik)

Dua panduan langkah-demi-langkah lengkap, pilih sesuai punya domain atau tidak:

| Panduan | Kapan dipakai | Link |
|---|---|---|
| **Runbook sslip.io** | Tanpa beli domain — pakai `pdfholmes.<ElasticIP>.sslip.io`. Paling cepat untuk demo/uji publik. | [`docs/RUNBOOK-sslip.md`](./docs/RUNBOOK-sslip.md) |
| **Deploy produksi** | Punya domain sendiri (mis. `pdfholmes.example.com`). | [`docs/DEPLOY.md`](./docs/DEPLOY.md) |

### Ringkas alur (AWS)

1. **Kredensial AWS** — `aws configure`, cek `aws sts get-caller-identity`.
2. **Elastic IP** (jalur sslip.io) atau **domain + DNS** (jalur DEPLOY) → hostname app.
3. **EC2** Graviton (`t4g.large` 8GB jika GROBID; `t4g.medium` tanpa) + Docker. SG: 80/443 publik, 22 hanya IP-mu.
4. **Cognito + Aurora** via Terraform (disarankan):
   ```bash
   cd infra/aws
   cp terraform.tfvars.example terraform.tfvars   # isi region, domain, cognito_domain_prefix, allowed_app_cidr, vpc_id
   terraform init && terraform apply               # Aurora ~10 menit
   ```
   Ambil output Terraform + `DATABASE_URL` dari Secrets Manager → masuk ke `.env.prod`.
   (Alternatif manual via Console: lihat §1B di `docs/DEPLOY.md`.)
5. **Clone + `.env.prod`** di EC2:
   ```bash
   cp .env.prod.example .env.prod
   openssl rand -base64 32   # NEXTAUTH_SECRET
   openssl rand -base64 32   # CREDENTIAL_ENC_KEY
   openssl rand -base64 48   # MINIO_ROOT_PASSWORD
   # isi COGNITO_*, DATABASE_URL, BASE_DOMAIN, ACME_EMAIL, AUTH_DEV_BYPASS=false
   ```
6. **Migrasi + jalankan**:
   ```bash
   PC="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file .env.prod"
   $PC run --rm --build migrate     # "Migrasi selesai."
   $PC up -d --build                # build semua + jalan
   ```
7. **DNS / TLS** — arahkan A-record (atau wildcard) ke IP EC2; Caddy terbitkan TLS otomatis (port 80 harus reachable).
8. **Verifikasi**:
   ```bash
   curl https://<host>/api/health         # {"status":"ok"}
   curl https://<host>/api/health/ready    # db+redis ok
   ```

### Setup di dashboard (setelah app jalan)

1. Buka `https://<host>` → **Masuk** → Hosted UI Cognito → **Sign up** dengan email → konfirmasi kode verifikasi → login.
2. **Portainer** (`https://portainer.<host>`) → buat akun admin **segera** (sebelum orang lain).
3. **MinIO console** (`https://console.<host>`) → cek bucket/credential bila perlu.
4. **Hidupkan AI nyata (NON-BYOK)** — set `OPENCODE_GO_API_KEY=...` di `.env.prod`, pastikan `ANALYZER_MOCK=false`, lalu `$PC up -d api analyzer`. Pengguna tak memasukkan key apa pun; semua memakai langganan server. Lihat [`docs/OPENCODE.md`](./docs/OPENCODE.md).
5. **Pakai** — upload PDF → pipeline `EXTRACT → ANALYZE` jalan → 48 field + research gap tersaji (status live via SSE).

### Checklist go-live keamanan (§16)

- [ ] `AUTH_DEV_BYPASS=false` (api menolak boot bila true + `NODE_ENV=production`).
- [ ] `CREDENTIAL_ENC_KEY` & `NEXTAUTH_SECRET` di-generate, bukan contoh.
- [ ] Kredensial MinIO default DIGANTI; console (9001) tak diekspos publik.
- [ ] Aurora di subnet privat; SG 5432 dari EC2 saja.
- [ ] HTTPS aktif di semua host (Caddy).
- [ ] Rate limit AI aktif (Throttler global + per-user/global OpenCode Go via Redis).
- [ ] `OPENCODE_GO_API_KEY` diisi & TIDAK pakai prefix `NEXT_PUBLIC_` (tak bocor ke browser).
- [ ] Login Portainer admin dibuat + password kuat.
- [ ] Backup: snapshot Aurora otomatis; pertimbangkan replikasi MinIO ke S3.

> Detail penuh (termasuk troubleshooting, operasional, biaya kasar) ada di [`docs/RUNBOOK-sslip.md`](./docs/RUNBOOK-sslip.md) dan [`docs/DEPLOY.md`](./docs/DEPLOY.md).

## Struktur

```
apps/web                 Next.js UI
apps/api                 NestJS BFF
services/extractor       worker PDF
services/analyzer        worker LLM
packages/field-schema    48 field — SATU sumber kebenaran (JSON) untuk TS + Python
packages/shared-types    tipe TS bersama
db/                      migrasi SQL + runner
infra/                   docker-compose, Caddyfile, Dockerfiles
infra/aws/               Terraform: Cognito + Aurora + Secrets Manager
```

## Roadmap

Fase 0–4 (scaffold→analisis) fungsional, kini memakai OpenCode Go (NON-BYOK). Fase 7 (Aurora/EC2) lihat dokumen arsitektur dan panduan di atas.

> ⚙️ Penyedia AI tunggal sisi-server: **OpenCode Go**. Tak ada BYOK; pengguna tak memasukkan API key. Lihat [`docs/OPENCODE.md`](./docs/OPENCODE.md).
