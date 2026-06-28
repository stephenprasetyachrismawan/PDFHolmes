# Arsitektur PDFHo!mes

Dokumen ini menjelaskan bagaimana bagian-bagian PDFHo!mes saling terhubung:
**Cognito** (login), **MinIO** (berkas), **Postgres** (data), dan **OpenCode Go**
(AI). Untuk detail masing-masing, lihat [`OPENCODE.md`](./OPENCODE.md) dan
[`COGNITO.md`](./COGNITO.md).

---

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
                     └────────────────┘   │  SSE, POST /api/ai/chat   │
                                          └───┬───────┬───────┬───────┘
                          presigned PUT/GET   │       │       │  key OPENCODE_GO
                                  ┌───────────┘       │       └──────────────┐
                                  ▼                   ▼                      ▼
                         ┌────────────────┐  ┌────────────────┐   ┌──────────────────┐
                         │  MinIO (S3)    │  │  Redis (queue) │   │   OpenCode Go    │
                         │ bucket/per-user│  │  +  pub/sub    │   │  (penyedia AI)   │
                         └───────┬────────┘  └───┬───────┬────┘   └──────────────────┘
                                 │  GET PDF       │       │  status pub/sub      ▲
                                 ▼                ▼       ▲                      │ key
                         ┌────────────────┐  ┌────────────────────────┐         │
                         │   extractor    │  │       analyzer         │─────────┘
                         │    PyMuPDF     │  │ per-field → OpenCode Go │
                         │  → extractions │  │  → analysis_sections   │
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
| `web` | Next.js 15 + Auth.js | UI, login Cognito, viewer PDF, panel 48 field, Asisten AI |
| `api` | NestJS | BFF: verifikasi JWT, CRUD, presigned URL, antrian, SSE, `POST /api/ai/chat` |
| `extractor` | Python (PyMuPDF) | PDF → teks/struktur → tabel `extractions` |
| `analyzer` | Python + OpenCode Go | per-field prompt → OpenCode Go → `analysis_sections` |
| `redis` | redis:7 | antrian job (`queue:extract`, `queue:analyze`) + pub/sub status |
| `minio` | MinIO | penyimpanan PDF, satu bucket per pengguna |
| `proxy` | Caddy 2 | HTTPS otomatis + routing |

Database = **Aurora PostgreSQL (Serverless v2)** + pgvector, di luar Compose,
diakses lewat IAM auth (lihat bagian 4).

---

## 2. Hubungan ke Cognito (login)

- `web` memakai **Authorization Code + PKCE** ke Hosted UI Cognito, lalu menyimpan
  `id_token` di sesi (`apps/web/src/auth.ts`).
- Setiap panggilan ke `api` membawa `Authorization: Bearer <id_token>`.
- `api` memverifikasi tanda tangan via **JWKS** (`COGNITO_JWKS_URL`), lalu mencocokkan
  `issuer` (`COGNITO_ISSUER`) **dan** audiens (`COGNITO_CLIENT_ID`) di
  `apps/api/src/auth/jwt.strategy.ts`. Token dari app-client lain ditolak.
- **Sinkron pengguna**: saat token valid pertama kali, `api` meng-*upsert* baris
  `users` dari klaim (`sub` → `cognito_sub`, `email`) dan menetapkan `minio_bucket`.
- **Isolasi**: semua query difilter `user_id`, jadi satu pengguna tak bisa membaca
  data pengguna lain.

Detail: [`COGNITO.md`](./COGNITO.md).

---

## 3. Hubungan ke MinIO (penyimpanan berkas)

- **Bucket per pengguna** (`users.minio_bucket`) → berkas tiap pengguna terisolasi.
- **Upload**: `web` minta **presigned PUT** ke `api`; browser meng-PUT PDF
  **langsung** ke MinIO (tidak lewat `api`). Lalu `api` memvalidasi objek via
  `statObject` dan menandai dokumen `extracting`.
- **Lihat PDF**: `web` minta **presigned GET** untuk render (react-pdf).
- **Worker**: `extractor` mengunduh PDF dari MinIO memakai kredensial internal.
- Dua endpoint: `MINIO_ENDPOINT` (internal, dipakai api/extractor) vs
  `MINIO_PUBLIC_ENDPOINT` (URL presigned yang dibuka browser).

---

## 4. Hubungan ke Database (Aurora PostgreSQL + pgvector)

| Tabel | Isi | Relasi |
|---|---|---|
| `users` | pengguna (sinkron Cognito) + `minio_bucket` | akar isolasi |
| `folders` | folder bertingkat | `→ users` |
| `documents` | metadata PDF + `status` siklus hidup | `→ users` |
| `extractions` | hasil parser: `full_text`, `sections`, `metadata` | `→ documents` (1:1) |
| `analyses` | satu sesi analisis (bahasa/model) | `→ documents` |
| `analysis_sections` | **48 field** hasil + `embedding` (pgvector) | `→ analyses` |
| `ai_usage` | metadata pemakaian AI (audit) | `→ users` |

- `extractions` ditulis `extractor` — saat pengguna membuka PDF, hasil parser sudah
  ada di DB.
- `analysis_sections` ditulis `analyzer` — hasil OpenCode Go per field.
- `ai_usage` ditulis `api` tiap request `POST /api/ai/chat`
  (`user_id, model, input_length, status, latency_ms, created_at`) — **tanpa**
  prompt dan **tanpa** API key.

Database = Aurora dengan **IAM auth** (token IAM per koneksi + SSL); kredensial
diambil dari instance role EC2. Detail & backup: [`DATABASE.md`](./DATABASE.md).

---

## 5. Hubungan ke OpenCode Go (AI)

Penyedia AI **tunggal** sisi-server. Key (`OPENCODE_GO_API_KEY`) hanya di backend
(`api` + `analyzer`); tak pernah ke browser/bundle/log/response.

### 5.1 Asisten AI (chat)

```
web ──prompt──▶ POST /api/ai/chat (api)
                  ├─ login Cognito wajib
                  ├─ rate limit per-user + global (Redis)
                  ├─ sanitasi input + batas max_tokens
                  ├─ kirim ke OpenCode Go (key di header sisi-server)
                  ├─ normalisasi → { ok, model, content }
                  └─ catat ai_usage (tanpa prompt/key)
```

Routing mengikuti `OPENCODE_GO_PROVIDER_TYPE`:
- `anthropic` → `POST {base}/v1/messages`, header `x-api-key` + `anthropic-version: 2023-06-01`
- `openai` → `POST {base}/v1/chat/completions`, header `Authorization: Bearer`

### 5.2 Analisis paper

```
unggah → MinIO
  └▶ EXTRACT (extractor): PDF → teks → extractions
       └▶ ANALYZE (analyzer): (teks + PDF) per-field → OpenCode Go
            └▶ analysis_sections (48 field) → SSE status → web
```

---

## 6. Aliran data end-to-end

1. **Login** — Cognito Hosted UI → `web` simpan `id_token`.
2. **Upload** — presigned PUT → MinIO; `documents.status=extracting`.
3. **Extract** — `extractor` baca PDF dari MinIO, parser → `extractions`,
   `status=extracted`, lalu enqueue `ANALYZE`.
4. **Analyze** — `analyzer` kirim per field ke OpenCode Go → `analysis_sections`,
   `status=analyzed`; tiap field memicu event SSE.
5. **Tampil** — `web` berlangganan SSE → panel 48 field terisi streaming.
6. **Chat** — `web` → `POST /api/ai/chat` → OpenCode Go → balasan + `ai_usage`.

---

## 7. Keamanan (lapisan utama)

- **Login**: semua endpoint sensitif butuh JWT Cognito (verifikasi tanda tangan +
  issuer + audiens). Status dokumen (SSE) hanya bisa dilihat pemilik dokumennya.
- **Isolasi**: query difilter `user_id`; bucket MinIO per pengguna.
- **Rahasia**: `OPENCODE_GO_API_KEY` hanya backend; tak pernah `NEXT_PUBLIC_`.
- **Rate limit**: Throttler global + per-user/global OpenCode Go via Redis.
- **Input**: panjang dibatasi + `max_tokens` dibatasi; timeout + retry sekali.
- **Log**: tak me-log header `Authorization` maupun isi prompt.
- **Audit**: `ai_usage` menyimpan metadata saja (tanpa prompt/key).
- **Transport**: HTTPS via Caddy (sertifikat Let's Encrypt otomatis).
