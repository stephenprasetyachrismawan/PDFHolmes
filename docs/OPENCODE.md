# OpenCode Go — Penyedia AI Tunggal (NON-BYOK)

PDFHo!mes memakai **satu** penyedia AI sisi-server: **OpenCode Go**. Aplikasi ini
**bukan BYOK** (Bring Your Own Key). Pengguna **tidak** memasukkan API key apa pun;
semua fitur AI memakai **satu langganan** OpenCode Go yang dikonfigurasi di server.

> ⚠️ **Kuota dibagi bersama.** Karena semua pengguna memakai langganan yang sama,
> kuota bisa habis bila pemakaian total tinggi. Atur rate limit (di bawah) sesuai
> paket langganan Anda.

---

## 1. Berlangganan OpenCode Go

1. Buka situs OpenCode Go dan buat akun.
2. Pilih paket langganan (perhatikan batas token/permintaan per bulan).
3. Selesaikan pembayaran sampai langganan **aktif**.

## 2. Salin API key

1. Masuk ke dasbor OpenCode Go → menu **API Keys** (atau **Tokens**).
2. Klik **Create key**, beri nama mis. `pdfholmes-prod`.
3. **Salin key sekarang** — biasanya hanya ditampilkan sekali.
4. Simpan key di tempat aman (password manager / AWS Secrets Manager).

## 3. Masukkan key ke `.env`

Key **hanya** boleh ada di env sisi-server. **Jangan** memakai prefix
`NEXT_PUBLIC_` (itu membocorkannya ke bundle browser).

`.env` (dev) atau `.env.prod` (produksi):

```bash
OPENCODE_GO_API_KEY=sk-...            # dari langkah 2
OPENCODE_GO_MODEL=minimax-m2.7        # model default
OPENCODE_GO_PROVIDER_TYPE=anthropic   # anthropic | openai
OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go

# Batas keamanan / kuota (opsional — nilai default ditampilkan)
OPENCODE_GO_MAX_TOKENS=2000
OPENCODE_GO_MAX_INPUT_CHARS=8000
OPENCODE_GO_TIMEOUT_MS=60000
OPENCODE_GO_USER_RATE_PER_MIN=20      # batas per pengguna / menit
OPENCODE_GO_GLOBAL_RATE_PER_MIN=300   # batas seluruh server / menit
```

Variabel ini dipakai oleh **dua** service backend: `api` (chat) dan `analyzer`
(analisis 48 field). Keduanya membaca key dari env yang sama.

## 4. Jalankan aplikasi

Dev:

```bash
cp .env.example .env     # isi OPENCODE_GO_API_KEY + Cognito + secret
pnpm install
pnpm compose:dev
open http://localhost:3000
```

Produksi (ringkas — detail di `docs/DEPLOY.md`):

```bash
PC="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file .env.prod"
$PC up -d --build api analyzer
```

Coba: buka **Asisten AI** di nav, kirim pesan. Atau upload PDF → otomatis
ter-ekstrak lalu dianalisis OpenCode Go (lihat alur di bawah).

---

## Cara kerja routing (referensi)

`OPENCODE_GO_PROVIDER_TYPE` menentukan endpoint dan bentuk body:

### `anthropic` (default)

```
POST {OPENCODE_GO_BASE_URL}/v1/messages
Authorization: Bearer ${OPENCODE_GO_API_KEY}
anthropic-version: 2023-06-01
Content-Type: application/json

{ "model": OPENCODE_GO_MODEL, "max_tokens": 2000,
  "messages": [ { "role": "user", "content": userPrompt } ] }
```

### `openai`

```
POST {OPENCODE_GO_BASE_URL}/v1/chat/completions
Authorization: Bearer ${OPENCODE_GO_API_KEY}
Content-Type: application/json

{ "model": OPENCODE_GO_MODEL,
  "messages": [ { "role": "user", "content": userPrompt } ] }
```

### Ganti model

Ubah `OPENCODE_GO_MODEL` (mis. `kimi-k2.7`, `deepseek-v4-pro`, `glm-5.2`, atau
model OpenAI-compatible lain) dan set `OPENCODE_GO_PROVIDER_TYPE` yang sesuai,
lalu restart `api` + `analyzer`. Tak ada perubahan kode.

---

## Alur "buka PDF → field rangkuman terisi"

1. **Upload** — `web` minta presigned PUT, file di-PUT langsung ke MinIO.
2. **Extract (text parser)** — worker `extractor` mengunduh PDF, menjalankan
   text parser (PyMuPDF + GROBID), dan **menyimpan hasilnya ke DB** (tabel
   `extractions`: `full_text`, `sections`, `metadata`). Jadi saat pengguna membuka
   PDF, hasil parser sudah ada di database.
3. **Analyze (OpenCode Go)** — extractor otomatis meng-enqueue `ANALYZE`. Worker
   `analyzer` membentuk konteks dari **hasil text parser + PDF** dan, per field,
   mengirimnya ke OpenCode Go. Hasil ditulis ke `analysis_sections`.
4. **Tampil** — `web` menerima status live via SSE dan menampilkan ke-48 field
   yang sudah diproses OpenCode Go.

> Tidak ada kredensial per-user di alur ini. Bila `OPENCODE_GO_API_KEY` kosong
> atau `ANALYZER_MOCK=true`, analyzer memakai MockProvider (demo tanpa AI nyata).

---

## Keamanan (ringkas)

- API key **hanya** dibaca dari `process.env.OPENCODE_GO_API_KEY` di backend.
- Tak pernah dikirim ke browser, bundle frontend, log, console, response JSON,
  pesan error, atau env klien.
- Backend tak pernah me-log header `Authorization` maupun isi prompt.
- Auth wajib sebelum request AI (Cognito JWT). Rate limit per-user **dan** global.
- Input di-sanitasi (trim + batas panjang) dan `max_tokens` dibatasi.
- Timeout + **retry sekali** hanya untuk error jaringan transien.
- Metadata pemakaian disimpan per request di tabel `ai_usage`
  (`user_id, model, input_length, status, latency_ms, created_at`) — **tanpa**
  prompt dan **tanpa** API key.
