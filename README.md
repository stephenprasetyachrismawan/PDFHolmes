# PDFHo!mes

Platform web untuk membedah artikel riset (PDF) menjadi **analisis terstruktur 48
field** + deteksi *research gap*, dalam bahasa pilihan pengguna. Dilengkapi
**Asisten AI** (chat). Penyedia AI tunggal: **OpenCode Go** (NON-BYOK).

Implementasi dari [`PDFHomes_Rencana_Arsitektur.md`](./PDFHomes_Rencana_Arsitektur.md).

## Daftar isi

- [Cara kerja singkat](#cara-kerja-singkat)
- [AI: OpenCode Go (NON-BYOK)](#ai-opencode-go-non-byok)
- [Quick start (dev)](#quick-start-dev)
- [Deploy produksi (AWS)](#deploy-produksi-aws)
- [Dokumentasi](#dokumentasi)
- [Struktur repo](#struktur-repo)

---

## Cara kerja singkat

Layanan berjalan via Docker Compose dalam satu jaringan:

| Service | Stack | Peran |
|---|---|---|
| `web` | Next.js 15 + Auth.js | UI, login Cognito, PDF viewer, panel 48 field, Asisten AI |
| `api` | NestJS | BFF: verifikasi JWT, CRUD, presigned URL, enqueue, SSE, `POST /api/ai/chat` |
| `extractor` | Python (PyMuPDF + GROBID) | PDF → teks/struktur (text parser) → DB `extractions` |
| `analyzer` | Python + OpenCode Go | per-field prompt → OpenCode Go → `analysis_sections` |
| `grobid` | lfoppiano/grobid | PDF ilmiah → TEI XML |
| `redis` | redis:7 | antrian job + pub/sub status |
| `minio` | minio | object storage PDF (bucket per-user) |
| `proxy` | caddy:2 | TLS + routing |
| `db` (dev) | pgvector/pgvector:pg16 | Postgres lokal (prod: Aurora) |

**Pipeline (async):**

```
upload → MinIO
  └▶ EXTRACT  (extractor): text parser → DB extractions
       └▶ ANALYZE (analyzer): teks parser + PDF → OpenCode Go → analysis_sections
            └▶ web tampilkan 48 field (status live via SSE)
```

Jadi saat pengguna membuka PDF, hasil text parser sudah ada di DB dan field
rangkuman terisi otomatis oleh OpenCode Go.

Detail relasi Cognito/MinIO/DB/OpenCode: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## AI: OpenCode Go (NON-BYOK)

Aplikasi ini **bukan BYOK**. Pengguna **tidak** memasukkan API key sendiri.
Seluruh app berbagi **satu** langganan OpenCode Go dari env server
(`OPENCODE_GO_API_KEY`). Key hanya hidup di backend (`api` + `analyzer`); tak
pernah ke browser, bundle frontend, log, response, atau pesan error.

- **Analisis 48 field**: analyzer mengirim (teks hasil parser + konteks PDF) ke
  OpenCode Go, lalu menulis hasil ke `analysis_sections`.
- **Asisten AI (chat)**: frontend hanya mengirim prompt ke `POST /api/ai/chat`;
  backend yang memanggil OpenCode Go.

Langganan, copy key, `.env`, dan penjelasan kuota bersama:
[`docs/OPENCODE.md`](./docs/OPENCODE.md).

---

## Quick start (dev)

```bash
cp .env.example .env          # isi Cognito + OPENCODE_GO_API_KEY + secret
pnpm install                  # deps TS (web/api/packages)
pnpm compose:dev              # nyalakan semua service + db lokal (migrasi otomatis)
open http://localhost:3000
```

- **Tanpa Cognito?** Set `AUTH_DEV_BYPASS=true` di `.env` → login dev tanpa AWS.
  (Dilarang di produksi.)
- **Tanpa key OpenCode Go?** Biarkan `OPENCODE_GO_API_KEY` kosong → analyzer pakai
  MockProvider (demo pipeline tanpa AI nyata).

---

## Deploy produksi (AWS)

Pilih satu panduan sesuai punya domain atau tidak:

| Panduan | Kapan | Link |
|---|---|---|
| **Runbook sslip.io** | Tanpa domain — pakai `pdfholmes.<ElasticIP>.sslip.io` (paling cepat). | [`docs/RUNBOOK-sslip.md`](./docs/RUNBOOK-sslip.md) |
| **Deploy produksi** | Punya domain sendiri. | [`docs/DEPLOY.md`](./docs/DEPLOY.md) |

### Ringkas alur

1. **Kredensial AWS** — `aws configure`; cek `aws sts get-caller-identity`.
2. **Hostname** — Elastic IP (sslip.io) atau domain + DNS.
3. **EC2** Graviton (`t4g.large` 8GB bila pakai GROBID) + Docker. SG: 80/443
   publik, 22 hanya IP-mu.
4. **Cognito + Aurora** via Terraform:
   ```bash
   cd infra/aws
   cp terraform.tfvars.example terraform.tfvars   # region, domain, cognito_domain_prefix, ...
   terraform init && terraform apply               # Aurora ~10 menit
   ```
   Ambil output Terraform + `DATABASE_URL` (Secrets Manager) → `.env.prod`.
   Setup Cognito lengkap: [`docs/COGNITO.md`](./docs/COGNITO.md).
5. **`.env.prod`** di EC2:
   ```bash
   cp .env.prod.example .env.prod
   openssl rand -base64 32   # NEXTAUTH_SECRET
   openssl rand -base64 48   # MINIO_ROOT_PASSWORD
   # isi COGNITO_*, DATABASE_URL, OPENCODE_GO_API_KEY,
   #     BASE_DOMAIN, ACME_EMAIL, AUTH_DEV_BYPASS=false
   ```
6. **Migrasi + jalankan**:
   ```bash
   PC="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file .env.prod"
   $PC run --rm --build migrate     # "Migrasi selesai."
   $PC up -d --build
   ```
7. **DNS / TLS** — arahkan A-record ke IP EC2; Caddy terbitkan TLS otomatis.
8. **Verifikasi**:
   ```bash
   curl https://<host>/api/health         # {"status":"ok"}
   curl https://<host>/api/health/ready    # db+redis ok
   ```

### Checklist go-live keamanan

- [ ] `AUTH_DEV_BYPASS=false` (api menolak boot bila true + `NODE_ENV=production`).
- [ ] `NEXTAUTH_SECRET` di-generate, bukan contoh.
- [ ] `OPENCODE_GO_API_KEY` diisi & **tidak** pakai prefix `NEXT_PUBLIC_`.
- [ ] Kredensial MinIO default DIGANTI; console (9001) tak diekspos publik.
- [ ] Aurora di subnet privat; SG 5432 dari EC2 saja.
- [ ] HTTPS aktif di semua host (Caddy).
- [ ] Rate limit AI aktif (Throttler global + per-user/global OpenCode Go via Redis).
- [ ] Login Portainer admin dibuat + password kuat.
- [ ] Backup: snapshot Aurora otomatis; pertimbangkan replikasi MinIO ke S3.

---

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [`docs/OPENCODE.md`](./docs/OPENCODE.md) | AI OpenCode Go: langganan, key, `.env`, routing, kuota bersama, alur analisis |
| [`docs/COGNITO.md`](./docs/COGNITO.md) | Setup Cognito dari nol (Terraform + Console + troubleshooting) |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Arsitektur detail: relasi Cognito/MinIO/DB/OpenCode |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | Deploy produksi dengan domain |
| [`docs/RUNBOOK-sslip.md`](./docs/RUNBOOK-sslip.md) | Deploy cepat tanpa domain (sslip.io) |

---

## Struktur repo

```
apps/web                 Next.js UI (panel field + Asisten AI)
apps/api                 NestJS BFF (+ POST /api/ai/chat)
services/extractor       worker PDF → text parser
services/analyzer        worker LLM (OpenCode Go)
packages/field-schema    48 field — SATU sumber kebenaran (JSON) untuk TS + Python
packages/shared-types    tipe TS bersama
db/                      migrasi SQL + runner
infra/                   docker-compose, Caddyfile, Dockerfiles
infra/aws/               Terraform: Cognito + Aurora + Secrets Manager
```
