# Arsitektur PDFHo!mes

Ringkas, rapi, dan detail — fokus pada hubungan antar-komponen: **Cognito**,
**MinIO**, **Database**, dan penyedia AI tunggal **OpenCode Go** (NON-BYOK).

Dokumen rencana panjang: [`../PDFHomes_Rencana_Arsitektur.md`](../PDFHomes_Rencana_Arsitektur.md).
AI: [`OPENCODE.md`](./OPENCODE.md) · Auth: [`COGNITO.md`](./COGNITO.md).

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
                          presigned PUT/GET   │       │       │  Bearer OPENCODE_GO_API_KEY
                                  ┌───────────┘       │       └──────────────┐
                                  ▼                   ▼                      ▼
                         ┌────────────────┐  ┌────────────────┐   ┌──────────────────┐
                         │  MinIO (S3)    │  │  Redis (queue) │   │   OpenCode Go    │
                         │ bucket/per-user│  │  +  pub/sub    │   │  (AI provider)   │
                         └───────┬────────┘  └───┬───────┬────┘   └──────────────────┘
                                 │  GET PDF       │       │  status pub/sub      ▲
                                 ▼                ▼       ▲                      │ Bearer key
                         ┌────────────────┐  ┌────────────────────────┐         │
                         │   extractor    │  │       analyzer         │─────────┘
                         │ PyMuPDF+GROBID │  │ per-field → OpenCode Go │
                         │  → extractions │  │  → analysis_sections   │
                         └───────┬────────┘  └───────────┬────────────┘
                                 └──────────┬────────────┘
                                            ▼
                                 ┌────────────────────────┐
                                 │  PostgreSQL / Aurora    │
                                 │  + pgvector (embedding) │
                                 └────────────────────────┘
```

Service (Docker Compose, satu jaringan):

| Service | Stack | Peran |
|---|---|---|
| `web` | Next.js 15 + Auth.js | UI, login Cognito, PDF viewer, panel 48 field, **Asisten AI** |
| `api` | NestJS | BFF: verifikasi JWT, CRUD, presigned URL, enqueue, SSE, `POST /api/ai/chat` |
| `extractor` | Python (PyMuPDF + GROBID) | PDF → teks/struktur (text parser) → DB `extractions` |
| `analyzer` | Python + **OpenCode Go** | per-field prompt → OpenCode Go → `analysis_sections` |
| `redis` | redis:7 | antrian job (`queue:extract`, `queue:analyze`) + pub/sub status |
| `minio` | minio | object storage PDF, **bucket per-user** |
| `db` / Aurora | pgvector/pg16 | data relasional + vektor embedding |
| `proxy` | caddy:2 | TLS + routing |

---

## 2. Hubungan ke Cognito (auth)

- `web` memakai **Authorization Code + PKCE** ke Hosted UI Cognito; menyimpan
  `id_token` di sesi (`apps/web/src/auth.ts`).
- Setiap panggilan ke `api` membawa `Authorization: Bearer <id_token>`.
- `api` memverifikasi tanda tangan via **JWKS** (`COGNITO_JWKS_URL`), mencocokkan
  `issuer` (`COGNITO_ISSUER`) dan audiens (`COGNITO_CLIENT_ID`) di
  `apps/api/src/auth/jwt.strategy.ts`.
- **Sinkron pengguna**: saat token valid pertama kali, `api` meng-*upsert* baris
  `users` dari klaim (`sub` → `cognito_sub`, `email`) dan menetapkan `minio_bucket`.
- **Isolasi**: semua query difilter `user_id` → satu pengguna tak bisa membaca data
  pengguna lain.

Detail setup: [`COGNITO.md`](./COGNITO.md).

---

## 3. Hubungan ke MinIO (object storage)

- **Bucket per-user** (`users.minio_bucket`) → isolasi berkas antar pengguna.
- **Upload**: `web` minta **presigned PUT** ke `api`; browser meng-PUT PDF
  **langsung** ke MinIO (tidak lewat `api`). `api` lalu validasi objek via
  `statObject` dan menandai dokumen `extracting`.
- **View**: `web` minta **presigned GET** untuk render PDF (react-pdf).
- **Read worker**: `extractor` mengunduh PDF dari MinIO (kredensial internal)
  untuk diproses.
- Endpoint: `MINIO_ENDPOINT` (internal, dipakai api/extractor) vs
  `MINIO_PUBLIC_ENDPOINT` (URL presigned yang dilihat browser).

---

## 4. Hubungan ke Database (Postgres / Aurora)

Tabel inti (`db/migrations`):

| Tabel | Isi | Relasi |
|---|---|---|
| `users` | pengguna (sinkron Cognito) + `minio_bucket` | akar isolasi |
| `folders` | folder nested | `→ users` |
| `documents` | metadata PDF + `status` siklus hidup | `→ users` |
| `extractions` | **hasil text parser**: `full_text`, `sections`, `metadata` | `→ documents` (1:1) |
| `analyses` | satu kali analisis (bahasa/model) | `→ documents` |
| `analysis_sections` | **48 field** hasil + `embedding` (pgvector) | `→ analyses` |
| `ai_usage` | metadata pemakaian AI (audit/kuota) | `→ users` |

- `extractions` ditulis `extractor` (Python) — saat pengguna membuka PDF, hasil
  text parser sudah ada di DB.
- `analysis_sections` ditulis `analyzer` (Python) — hasil OpenCode Go per field.
- `ai_usage` ditulis `api` untuk tiap request `POST /api/ai/chat`
  (`user_id, model, input_length, status, latency_ms, created_at`) — **tanpa**
  prompt dan **tanpa** API key.
- Aurora di **subnet privat**; SG 5432 hanya dari host aplikasi. `DATABASE_URL`
  diambil dari Secrets Manager (lihat `infra/aws`).

---

## 5. Hubungan ke OpenCode Go (AI, NON-BYOK)

Penyedia AI **tunggal** sisi-server. Key (`OPENCODE_GO_API_KEY`) hanya di backend
(`api` + `analyzer`); tak pernah ke browser/bundle/log/response.

### 5.1 Asisten AI (chat)

```
web ──prompt──▶ POST /api/ai/chat (api)
                  ├─ auth Cognito wajib
                  ├─ rate limit per-user + global (Redis)
                  ├─ sanitasi input + batas max_tokens
                  ├─ Bearer OPENCODE_GO_API_KEY ──▶ OpenCode Go
                  ├─ normalisasi → { ok, model, content }
                  └─ catat ai_usage (tanpa prompt/kunci)
```

Routing endpoint mengikuti `OPENCODE_GO_PROVIDER_TYPE`:
- `anthropic` → `POST {base}/v1/messages` (+ `anthropic-version: 2023-06-01`)
- `openai` → `POST {base}/v1/chat/completions`

### 5.2 Analisis paper (alur "buka PDF → field terisi")

```
upload → MinIO
  └▶ EXTRACT (extractor): PDF → text parser → DB extractions
       └▶ ANALYZE (analyzer): (teks parser + PDF) per-field
            └▶ OpenCode Go → analysis_sections (48 field)
                 └▶ SSE status → web menampilkan hasil
```

Bila `OPENCODE_GO_API_KEY` kosong atau `ANALYZER_MOCK=true`, analyzer memakai
MockProvider (demo tanpa AI nyata).

---

## 6. Aliran data end-to-end (ringkas)

1. **Login** — Cognito Hosted UI → `web` simpan `id_token`.
2. **Upload** — presigned PUT → MinIO; `documents.status=extracting`.
3. **Extract** — `extractor` baca PDF dari MinIO, text parser → `extractions`,
   `status=extracted`, lalu enqueue `ANALYZE`.
4. **Analyze** — `analyzer` kirim per field ke OpenCode Go → `analysis_sections`,
   `status=analyzed`; tiap field memicu event SSE.
5. **Tampil** — `web` berlangganan SSE → panel 48 field terisi streaming.
6. **Chat** — `web` → `POST /api/ai/chat` → OpenCode Go → balasan + `ai_usage`.

---

## 7. Keamanan (lapisan utama)

- **Auth**: semua endpoint sensitif butuh JWT Cognito; `AUTH_DEV_BYPASS` dilarang
  di produksi.
- **Isolasi**: query difilter `user_id`; bucket MinIO per-user.
- **Rahasia**: `OPENCODE_GO_API_KEY` hanya backend; tak pernah `NEXT_PUBLIC_`.
- **Rate limit**: Throttler global + per-user/global OpenCode Go via Redis.
- **Input**: sanitasi panjang + `max_tokens` dibatasi; timeout + retry sekali.
- **Log**: tak me-log header `Authorization` maupun isi prompt.
- **Audit**: `ai_usage` menyimpan metadata saja (tanpa prompt/kunci).
- **Transport**: TLS di semua host (Caddy); Aurora privat.
