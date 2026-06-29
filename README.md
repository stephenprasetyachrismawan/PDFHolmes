# PDFHo!mes

PDFHo!mes membaca artikel riset (PDF) dan membedahnya menjadi **48 field analisis
terstruktur** plus deteksi *research gap* — dalam bahasa yang Anda pilih. Semua
kecerdasannya ditenagai satu penyedia: **OpenCode Go**.

Aplikasi ini berjalan publik di **https://pdfholmes.stevewithcode.net** dengan login
Amazon Cognito.

---

## Cara kerjanya

Anda mengunggah sebuah PDF. PDFHo!mes menyimpannya, menarik teks dan strukturnya,
lalu meminta OpenCode Go mengisi 48 field analisis dalam **satu prompt JSON** untuk
semua field sekaligus. Hasilnya muncul streaming di layar — jadi begitu Anda membuka
dokumen, rangkumannya sudah ada.

```
unggah → MinIO
   └▶ extractor  : PDF → teks + struktur (PyMuPDF + GROBID) → tabel extractions
        └▶ analyzer : (teks + struktur) → 1 prompt batch → OpenCode Go → analysis_sections
             └▶ web   : 48 field tampil live lewat SSE
```

Semua bagian berjalan sebagai container Docker dalam satu jaringan:

| Service | Stack | Tugasnya |
|---|---|---|
| `web` | Next.js 15 + Auth.js | Tampilan, login Cognito, viewer PDF, panel 48 field |
| `api` | NestJS | Verifikasi token, CRUD, presigned URL, antrian, SSE |
| `extractor` | Python (PyMuPDF + GROBID) | PDF → teks & struktur → tabel `extractions` |
| `analyzer` | Python + OpenCode Go | 1 prompt batch untuk 48 field → `analysis_sections` |
| `grobid` | GROBID | Parsing artikel ilmiah → TEI XML (judul/abstrak/section/referensi) |
| `redis` | redis:7 | Antrian job + pub/sub status |
| `minio` | MinIO | Penyimpanan PDF, satu bucket per pengguna |
| `proxy` | Caddy 2 | HTTPS otomatis + routing |
| `portainer` | Portainer CE | UI manajemen Docker (port 9443) |

Database memakai **Aurora PostgreSQL (Serverless v2)** dengan pgvector, diakses lewat
IAM auth — terpisah dari container, jadi tidak ada service DB di tabel di atas.
Service `migrate` menyambung ke Aurora via IAM dan menerapkan migrasi saat `up`.

Detail relasi antar-komponen ada di [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Analisis — OpenCode Go

PDFHo!mes **bukan** aplikasi BYOK. Pengguna tidak pernah memasukkan API key.
Seluruh aplikasi berbagi **satu** langganan OpenCode Go yang disetel di server
(`OPENCODE_GO_API_KEY`). Key itu hanya hidup di backend (`analyzer`) — tidak pernah
sampai ke browser, bundle frontend, log, atau pesan error.

Analisis 48 field dikerjakan `analyzer` dalam **satu panggilan batch**: semua field
dikirim dalam satu prompt, dijawab sebagai satu JSON, lalu divalidasi dan disimpan
per field ke `analysis_sections`.

Langganan, key, dan pengaturan model: [`docs/OPENCODE.md`](./docs/OPENCODE.md).

---

## Menjalankan stack

Stack berjalan dari satu host EC2 dengan Docker Compose. Konfigurasinya ada di
`.env` (tidak ikut di Git).

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d
```

Database eksternal (Aurora), jadi tidak ada container Postgres — cukup compose
dasar. Service `migrate` menyambung ke Aurora via IAM dan menerapkan migrasi
otomatis saat `up`. Detail: [`docs/DATABASE.md`](./docs/DATABASE.md).

Cek sehat:

```bash
curl https://pdfholmes.stevewithcode.net/api/health         # {"status":"ok"}
curl https://pdfholmes.stevewithcode.net/api/health/ready   # db + redis ok
```

Menyiapkan dari awal (domain, Cognito, AWS): [`docs/DEPLOY.md`](./docs/DEPLOY.md).

---

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | Langkah deploy lengkap di EC2 (Cognito + domain + Docker) |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Bagaimana Cognito, MinIO, DB, dan OpenCode Go saling terhubung |
| [`docs/COGNITO.md`](./docs/COGNITO.md) | Login Cognito: provisioning, env, dan troubleshooting |
| [`docs/OPENCODE.md`](./docs/OPENCODE.md) | OpenCode Go: langganan, key, model, alur analisis |
| [`docs/DOMAIN.md`](./docs/DOMAIN.md) | DNS, Elastic IP, dan TLS untuk domain |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | Aurora PostgreSQL + pgvector via IAM auth: konfigurasi & backup |

---

## Struktur repo

```
apps/web                 UI Next.js (panel 48 field)
apps/api                 BFF NestJS
services/extractor       worker PDF → teks (PyMuPDF + GROBID)
services/analyzer        worker analisis batch (OpenCode Go)
packages/field-schema    48 field — satu sumber kebenaran (JSON) untuk TS + Python
packages/shared-types    tipe TS bersama
db/                      migrasi SQL + runner
infra/                   docker-compose, Caddyfile, Dockerfile
infra/aws/               Terraform: Cognito
```
