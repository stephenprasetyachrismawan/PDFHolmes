# PDFHo!mes

PDFHo!mes membaca artikel riset (PDF) dan membedahnya menjadi **48 field analisis
terstruktur** plus deteksi *research gap* — dalam bahasa yang Anda pilih. Ada juga
**Asisten AI** untuk tanya-jawab. Semua kecerdasannya ditenagai satu penyedia:
**OpenCode Go**.

Aplikasi ini berjalan publik di **https://pdfholmes.stevewithcode.net** dengan login
Amazon Cognito.

---

## Cara kerjanya

Anda mengunggah sebuah PDF. PDFHo!mes menyimpannya, menarik teks dan strukturnya,
lalu meminta OpenCode Go mengisi 48 field analisis satu per satu. Hasilnya muncul
streaming di layar — jadi begitu Anda membuka dokumen, rangkumannya sudah ada.

```
unggah → MinIO
   └▶ extractor  : PDF → teks + struktur  → tabel extractions
        └▶ analyzer : (teks + PDF) per field → OpenCode Go → analysis_sections
             └▶ web   : 48 field tampil live lewat SSE
```

Semua bagian berjalan sebagai container Docker dalam satu jaringan:

| Service | Stack | Tugasnya |
|---|---|---|
| `web` | Next.js 15 + Auth.js | Tampilan, login Cognito, viewer PDF, panel 48 field, Asisten AI |
| `api` | NestJS | Verifikasi token, CRUD, presigned URL, antrian, SSE, `POST /api/ai/chat` |
| `extractor` | Python (PyMuPDF) | PDF → teks & struktur → tabel `extractions` |
| `analyzer` | Python + OpenCode Go | Per field: kirim ke OpenCode Go → `analysis_sections` |
| `redis` | redis:7 | Antrian job + pub/sub status |
| `minio` | MinIO | Penyimpanan PDF, satu bucket per pengguna |
| `db` | Postgres 16 + pgvector | Data relasional + embedding |
| `proxy` | Caddy 2 | HTTPS otomatis + routing |

Detail relasi antar-komponen ada di [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Asisten AI & analisis — OpenCode Go

PDFHo!mes **bukan** aplikasi BYOK. Pengguna tidak pernah memasukkan API key.
Seluruh aplikasi berbagi **satu** langganan OpenCode Go yang disetel di server
(`OPENCODE_GO_API_KEY`). Key itu hanya hidup di backend (`api` dan `analyzer`) —
tidak pernah sampai ke browser, bundle frontend, log, atau pesan error.

- **Analisis 48 field** dikerjakan `analyzer`.
- **Asisten AI (chat)** lewat `POST /api/ai/chat` — browser cuma mengirim prompt,
  backend yang memanggil OpenCode Go.

Langganan, key, dan pengaturan model: [`docs/OPENCODE.md`](./docs/OPENCODE.md).

---

## Menjalankan stack

Stack berjalan dari satu host EC2 dengan Docker Compose. Konfigurasinya ada di
`.env` (tidak ikut di Git).

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.dev.yml \
  --env-file .env up -d
```

File compose kedua menambahkan service `db` (Postgres + pgvector dengan volume
persisten) — itulah database yang dipakai deployment ini. Migrasi DB jalan otomatis
lewat service `migrate` saat `up`.

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
| [`docs/DATABASE.md`](./docs/DATABASE.md) | Database Postgres dalam container: konfigurasi & backup |

---

## Struktur repo

```
apps/web                 UI Next.js (panel field + Asisten AI)
apps/api                 BFF NestJS (+ POST /api/ai/chat)
services/extractor       worker PDF → teks
services/analyzer        worker analisis (OpenCode Go)
packages/field-schema    48 field — satu sumber kebenaran (JSON) untuk TS + Python
packages/shared-types    tipe TS bersama
db/                      migrasi SQL + runner
infra/                   docker-compose, Caddyfile, Dockerfile
infra/aws/               Terraform: Cognito
```
