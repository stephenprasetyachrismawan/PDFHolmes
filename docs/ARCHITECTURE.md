# Arsitektur PDFHo!mes

Dokumen ini menjelaskan bagaimana bagian-bagian PDFHo!mes saling terhubung: Cognito
untuk login, MinIO untuk berkas, PostgreSQL untuk data, dan OpenCode Go untuk AI. Untuk
detail masing-masing, lihat [`OPENCODE.md`](./OPENCODE.md) dan [`COGNITO.md`](./COGNITO.md).

## 1. Peta komponen

```
                         ┌──────────────────────────────┐
                         │           Browser            │
                         │  Next.js UI (Auth.js v5)     │
                         └───────┬───────────────┬──────┘
                  (login OIDC)   │               │  (Bearer id_token)
                                 ▼               ▼
                     ┌────────────────┐   ┌──────────────────────────┐
                     │  AWS Cognito   │   │      api (NestJS, BFF)    │
                     │  User Pool +   │   │  verifikasi JWT via JWKS  │
                     │  Hosted UI     │◀──┤  CRUD, presign, enqueue,  │
                     └────────────────┘   │  SSE status               │
                                          └───┬───────┬──────────────┘
                          presigned PUT/GET   │       │
                                  ┌───────────┘       │
                                  ▼                   ▼
                         ┌────────────────┐  ┌────────────────┐   ┌──────────────────┐
                         │  MinIO (S3)    │  │  Redis (queue) │   │   OpenCode Go    │
                         │ bucket/per-user│  │  +  pub/sub    │   │  (penyedia AI)   │
                         └───────┬────────┘  └───┬───────┬────┘   └──────────────────┘
                                 │  GET PDF       │       │  status pub/sub      ▲
                                 ▼                ▼       ▲                      │ key
                         ┌────────────────┐  ┌────────────────────────┐         │
                         │   extractor    │  │       analyzer         │─────────┘
                         │    PyMuPDF     │  │  1 prompt batch →       │
                         │  → extractions │  │  OpenCode Go →          │
                         │                │  │  analysis_sections      │
                         └───────┬────────┘  └───────────┬────────────┘
                                 └──────────┬────────────┘
                                            ▼
                                 ┌────────────────────────┐
                                 │   Aurora PostgreSQL 17  │
                                 │  pgvector · IAM auth/SSL │
                                 └────────────────────────┘
```

Service (Docker Compose, satu jaringan):

| Service | Stack | Peran |
|---|---|---|
| `web` | Next.js 15 + Auth.js | UI, login Cognito, viewer PDF, panel 48 field, log pemrosesan |
| `api` | NestJS | BFF: verifikasi JWT, CRUD, presigned URL, antrian, SSE status |
| `extractor` | Python (PyMuPDF + GROBID) | PDF menjadi teks dan struktur, ditulis ke `extractions` |
| `analyzer` | Python + OpenCode Go | Satu prompt batch untuk 48 field, ditulis ke `analysis_sections` |
| `redis` | redis:7 | Antrian job (`queue:extract`, `queue:analyze`) dan pub/sub status |
| `minio` | MinIO | Penyimpanan PDF, satu bucket per pengguna |
| `proxy` | Caddy 2 | HTTPS otomatis dan routing |

Database adalah Aurora PostgreSQL Serverless v2 dengan pgvector, berada di luar Compose
dan diakses lewat IAM auth (lihat bagian 4).

## 2. Hubungan ke Cognito (login)

- `web` memakai Authorization Code dengan PKCE ke Hosted UI Cognito, lalu menyimpan
  `id_token` di sesi (`apps/web/src/auth.ts`).
- Setiap panggilan ke `api` membawa header `Authorization: Bearer <id_token>`.
- `api` memverifikasi tanda tangan token via JWKS (`COGNITO_JWKS_URL`), lalu mencocokkan
  `issuer` (`COGNITO_ISSUER`) dan audiens (`COGNITO_CLIENT_ID`) di
  `apps/api/src/auth/jwt.strategy.ts`. Token dari app-client lain ditolak.
- Sinkron pengguna: saat token valid pertama kali, `api` meng-upsert baris `users` dari
  klaim (`sub` menjadi `cognito_sub`, plus `email`) dan menetapkan `minio_bucket`.
- Isolasi: semua query difilter `user_id`, jadi satu pengguna tidak bisa membaca data
  pengguna lain.

Detail: [`COGNITO.md`](./COGNITO.md).

## 3. Hubungan ke MinIO (penyimpanan berkas)

- Bucket per pengguna (`users.minio_bucket`) membuat berkas tiap pengguna terisolasi.
- Upload: `web` minta presigned PUT ke `api`, lalu browser meng-PUT PDF langsung ke
  MinIO tanpa melewati `api`. Setelah itu `api` memvalidasi objek via `statObject` dan
  menandai dokumen `extracting`.
- Lihat PDF: `web` minta presigned GET untuk render dengan react-pdf.
- Worker: `extractor` mengunduh PDF dari MinIO memakai kredensial internal.
- Dua endpoint dipakai: `MINIO_ENDPOINT` (internal, untuk api dan extractor) dan
  `MINIO_PUBLIC_ENDPOINT` (URL presigned yang dibuka browser).

## 4. Hubungan ke database (Aurora PostgreSQL + pgvector)

| Tabel | Isi | Relasi |
|---|---|---|
| `users` | Pengguna (sinkron Cognito) dan `minio_bucket` | akar isolasi |
| `folders` | Folder bertingkat | menuju `users` |
| `documents` | Metadata PDF dan `status` siklus hidup | menuju `users` |
| `extractions` | Hasil parser: `full_text`, `sections`, `metadata` | menuju `documents` (1:1) |
| `analyses` | Satu sesi analisis (bahasa, model) | menuju `documents` |
| `analysis_sections` | 48 field hasil dan `embedding` (pgvector) | menuju `analyses` |
| `ai_usage` | Tabel audit pemakaian AI | menuju `users` |

- `extractions` ditulis `extractor`, jadi saat pengguna membuka PDF, hasil parser sudah
  ada di database.
- `analysis_sections` ditulis `analyzer`, satu baris per field dari hasil batch
  OpenCode Go.
- `ai_usage` adalah tabel audit warisan dari fitur chat yang sudah dihapus. Skemanya
  masih ada untuk kompatibilitas migrasi, tetapi tidak ada penulis aktif sekarang. Biar
  saja kalau Anda tidak butuh audit, atau pakai kembali kalau menambah jalur AI baru.

Database memakai IAM auth (token IAM per koneksi plus SSL). Kredensial diambil dari
instance role EC2. Detail dan backup: [`DATABASE.md`](./DATABASE.md).

## 5. Hubungan ke OpenCode Go (AI)

OpenCode Go adalah penyedia AI tunggal sisi-server. Key (`OPENCODE_GO_API_KEY`) hanya
ada di backend `analyzer`. Key tidak pernah dikirim ke browser, bundle, log, atau body
response.

Analisis paper berjalan begini:

```
unggah → MinIO
  └▶ EXTRACT (extractor): PDF → teks dan struktur → extractions
       └▶ ANALYZE (analyzer): teks + struktur → 1 prompt batch → OpenCode Go
            └▶ analysis_sections (48 field) → SSE status → web
```

`analyzer` menyusun satu prompt berisi seluruh konteks paper dan deskripsi ke-48 field,
lalu mengirim satu panggilan ke OpenCode Go. Model membalas satu JSON
`{field_key: {content, source, confidence}}`. Worker memisah JSON itu dan menyimpan tiap
field ke `analysis_sections`. Parser tahan terhadap JSON terpotong: kalau jawaban
kehilangan field di ujung, field tersebut diisi "Tidak dinyatakan dalam teks." alih-alih
menggagalkan seluruh analisis.

Routing mengikuti `OPENCODE_GO_PROVIDER_TYPE`:

- `anthropic`: `POST {base}/v1/messages`, header `x-api-key` dan `anthropic-version: 2023-06-01`.
- `openai`: `POST {base}/v1/chat/completions`, header `Authorization: Bearer`.

Detail model dan parameter: [`OPENCODE.md`](./OPENCODE.md).

## 6. Status live dan log pemrosesan

Worker mempublish status pipeline ke channel Redis `pdfholmes:status`. `api`
berlangganan channel itu dan meneruskannya ke browser lewat SSE, difilter per dokumen
dan hanya untuk pemiliknya. `web` memakai aliran ini untuk dua hal:

- Memperbarui badge status dan mengisi panel 48 field saat tiap field selesai.
- Mengisi kotak "Log pemrosesan" di bawah halaman dokumen. Selain status, worker
  mengirim baris pesan bebas (`message`) pada tiap langkah: unduh PDF dan ukurannya,
  hasil PyMuPDF, langkah GROBID, panggilan ke AI, potongan respons mentah AI, dan
  penyelesaian. Log ini terkumpul sejak halaman dibuka dan membantu menelusuri dokumen
  yang lambat atau gagal.

## 7. Aliran data end-to-end

1. Login: Cognito Hosted UI, lalu `web` menyimpan `id_token`.
2. Upload: presigned PUT ke MinIO, `documents.status` menjadi `extracting`.
3. Extract: `extractor` membaca PDF dari MinIO, menjalankan parser, menulis
   `extractions`, mengubah status menjadi `extracted`, lalu meng-enqueue `ANALYZE`.
4. Analyze: `analyzer` mengirim satu prompt batch ke OpenCode Go, menyimpan 48 field ke
   `analysis_sections`, dan mengubah status menjadi `analyzed`. Tiap field memicu event
   SSE.
5. Tampil: `web` berlangganan SSE, panel 48 field terisi streaming, dan log pemrosesan
   mengalir.

Kalau job `ANALYZE` berjalan padahal baris `extractions` belum ada, `analyzer` tidak
menggagalkan dokumen. Worker meng-enqueue ulang `EXTRACT`, yang setelah selesai akan
meng-enqueue `ANALYZE` lagi. Dengan begitu ekstraksi yang hilang atau belum jalan
diperbaiki sendiri tanpa intervensi manual.

## 8. Keamanan (lapisan utama)

- Login: semua endpoint sensitif butuh JWT Cognito dengan verifikasi tanda tangan,
  issuer, dan audiens. Status dokumen lewat SSE hanya bisa dilihat pemilik dokumennya.
- Isolasi: query difilter `user_id`, dan tiap pengguna punya bucket MinIO sendiri.
- Rahasia: `OPENCODE_GO_API_KEY` hanya di backend, tidak pernah memakai prefix
  `NEXT_PUBLIC_`.
- Rate limit: NestJS Throttler membatasi request global dan endpoint analisis.
- Input: panjang konteks dibatasi `MAX_CONTEXT_CHARS`, dan `max_tokens` jawaban dibatasi.
- Log: header `Authorization` dan isi prompt tidak di-log.
- Transport: HTTPS lewat Caddy dengan sertifikat Let's Encrypt otomatis.
