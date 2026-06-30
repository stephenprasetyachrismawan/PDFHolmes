# PDFHo!mes

PDFHo!mes membaca artikel riset dalam format PDF dan membongkarnya menjadi 48 field
analisis terstruktur, lengkap dengan deteksi celah riset (research gap), dalam bahasa
yang Anda pilih. Satu penyedia mengerjakan seluruh bagian AI-nya: OpenCode Go.

Aplikasi berjalan publik di https://pdfholmes.stevewithcode.net dengan login Amazon
Cognito.

## Cara kerjanya

Anda mengunggah satu PDF. PDFHo!mes menyimpannya, menarik teks dan strukturnya, lalu
meminta OpenCode Go mengisi 48 field analisis dalam satu prompt JSON untuk semua field
sekaligus. Hasilnya mengalir ke layar lewat SSE, jadi field terisi satu per satu saat
Anda menonton, bukan menunggu layar kosong sampai semuanya selesai.

```
unggah → MinIO
   └▶ extractor : PDF → teks + struktur (PyMuPDF + GROBID) → tabel extractions
        └▶ analyzer : teks + struktur → 1 prompt batch → OpenCode Go → analysis_sections
             └▶ web  : 48 field tampil live lewat SSE
```

Di bawah panel analisis ada kotak "Log pemrosesan": kotak bergulir tinggi tetap yang
menampilkan tiap langkah pipeline secara langsung, termasuk respons mentah dari API AI.
Kotak ini berguna saat sebuah dokumen lambat atau gagal, karena Anda bisa melihat di
tahap mana prosesnya berhenti.

Semua bagian berjalan sebagai container Docker dalam satu jaringan:

| Service | Stack | Tugasnya |
|---|---|---|
| `web` | Next.js 15 + Auth.js | Tampilan, login Cognito, viewer PDF, panel 48 field, log pemrosesan |
| `api` | NestJS | Verifikasi token, CRUD, presigned URL, antrian, SSE |
| `extractor` | Python (PyMuPDF + GROBID) | PDF menjadi teks dan struktur, ditulis ke tabel `extractions` |
| `analyzer` | Python + OpenCode Go | Satu prompt batch untuk 48 field, ditulis ke `analysis_sections` |
| `grobid` | GROBID | Parsing artikel ilmiah menjadi TEI XML (judul, abstrak, section, referensi) |
| `redis` | redis:7 | Antrian job dan pub/sub status |
| `minio` | MinIO | Penyimpanan PDF, satu bucket per pengguna |
| `proxy` | Caddy 2 | HTTPS otomatis dan routing |
| `portainer` | Portainer CE | UI manajemen Docker (port 9443, di belakang Caddy) |

Database memakai Aurora PostgreSQL Serverless v2 dengan pgvector, diakses lewat IAM
auth. Database terpisah dari container, jadi tidak ada service Postgres di tabel di
atas. Service `migrate` menyambung ke Aurora via IAM dan menerapkan migrasi saat `up`.

Relasi antar-komponen dijelaskan di [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Analisis: OpenCode Go

PDFHo!mes bukan aplikasi BYOK. Pengguna tidak pernah memasukkan API key. Seluruh
aplikasi berbagi satu langganan OpenCode Go yang disetel di server lewat
`OPENCODE_GO_API_KEY`. Key itu hanya hidup di backend (service `analyzer`) dan tidak
pernah sampai ke browser, bundle frontend, log, atau pesan error.

Analisis 48 field dikerjakan `analyzer` dalam satu panggilan batch. Semua field dikirim
dalam satu prompt, dijawab sebagai satu JSON, lalu divalidasi dan disimpan per field ke
`analysis_sections`. Satu panggilan jauh lebih hemat token dan menghindari rate limit
dibanding 48 panggilan terpisah. Untuk dokumen besar yang lambat dijawab model, batas
waktu panggilan diatur lewat `OPENCODE_GO_TIMEOUT_S` (default 900 detik).

Langganan, key, model, dan parameter analisis: [`docs/OPENCODE.md`](./docs/OPENCODE.md).

## Menjalankan stack

Stack berjalan dari satu host EC2 dengan Docker Compose. Konfigurasinya ada di `.env`,
yang tidak ikut di Git.

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d
```

Database eksternal (Aurora), jadi tidak ada container Postgres. Cukup compose dasar.
Service `migrate` menyambung ke Aurora via IAM dan menerapkan migrasi otomatis saat
`up`. Detail: [`docs/DATABASE.md`](./docs/DATABASE.md).

Cek kesehatan:

```bash
curl https://pdfholmes.stevewithcode.net/api/health         # {"status":"ok"}
curl https://pdfholmes.stevewithcode.net/api/health/ready   # db dan redis ok
```

Menyiapkan dari awal (domain, Cognito, AWS): [`docs/DEPLOY.md`](./docs/DEPLOY.md).

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | Langkah deploy lengkap di EC2: Cognito, domain, Docker |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Bagaimana Cognito, MinIO, database, dan OpenCode Go saling terhubung |
| [`docs/COGNITO.md`](./docs/COGNITO.md) | Login Cognito: provisioning, env, troubleshooting |
| [`docs/OPENCODE.md`](./docs/OPENCODE.md) | OpenCode Go: langganan, key, model, parameter, alur analisis |
| [`docs/DOMAIN.md`](./docs/DOMAIN.md) | DNS, Elastic IP, dan TLS untuk domain |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | Aurora PostgreSQL dan pgvector via IAM auth: konfigurasi dan backup |

## Struktur repo

```
apps/web                 UI Next.js (panel 48 field, log pemrosesan)
apps/api                 BFF NestJS
services/extractor       worker PDF menjadi teks (PyMuPDF + GROBID)
services/analyzer        worker analisis batch (OpenCode Go)
packages/field-schema    48 field, satu sumber kebenaran (JSON) untuk TS dan Python
packages/shared-types    tipe TS bersama
db/                      migrasi SQL dan runner
infra/                   docker-compose, Caddyfile, Dockerfile
infra/aws/               Terraform: Cognito dan pendukung Aurora
```
