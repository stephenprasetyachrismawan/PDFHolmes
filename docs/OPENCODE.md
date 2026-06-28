# OpenCode Go — Penyedia AI Tunggal

Semua kecerdasan PDFHo!mes — analisis 48 field dan Asisten AI — ditenagai satu
penyedia: **OpenCode Go**. Aplikasi ini **bukan BYOK**. Pengguna tidak pernah
memasukkan API key; seluruh aplikasi memakai **satu langganan** yang disetel di
server.

> ⚠️ **Kuota dipakai bersama.** Karena semua pengguna berbagi langganan yang sama,
> kuota bisa habis kalau pemakaian total tinggi. Atur rate limit (di bawah) sesuai
> paket Anda.

---

## 1. Berlangganan & ambil key

1. Buat akun di OpenCode Go dan pilih paket (perhatikan batas token/permintaan).
2. Di dasbor, buka **API Keys**, buat key baru (mis. `pdfholmes-prod`).
3. **Salin saat itu juga** — biasanya hanya ditampilkan sekali. Simpan di tempat
   aman (password manager).

---

## 2. Masukkan ke `.env`

Key **hanya** boleh ada di env sisi-server. **Jangan** memberi prefix
`NEXT_PUBLIC_` — itu akan membocorkannya ke bundle browser.

```bash
OPENCODE_GO_API_KEY=sk-...            # dari langkah 1
OPENCODE_GO_MODEL=minimax-m2.7        # model default
OPENCODE_GO_PROVIDER_TYPE=anthropic   # anthropic | openai
OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go

# Batas keamanan / kuota (nilai default ditampilkan)
OPENCODE_GO_MAX_TOKENS=2000
OPENCODE_GO_MAX_INPUT_CHARS=8000
OPENCODE_GO_TIMEOUT_MS=60000
OPENCODE_GO_USER_RATE_PER_MIN=20      # batas per pengguna / menit
OPENCODE_GO_GLOBAL_RATE_PER_MIN=300   # batas seluruh server / menit
```

Dua service membaca env yang sama: `api` (chat) dan `analyzer` (analisis 48 field).
Setelah mengubahnya, restart keduanya:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml \
  --env-file .env up -d api analyzer
```

Cobalah: buka **Asisten AI** lalu kirim pesan, atau unggah PDF dan tunggu field
analisis terisi.

---

## 3. Routing per protokol

`OPENCODE_GO_PROVIDER_TYPE` menentukan endpoint, bentuk body, dan header auth.

### `anthropic` (default)

```
POST {OPENCODE_GO_BASE_URL}/v1/messages
x-api-key: ${OPENCODE_GO_API_KEY}
anthropic-version: 2023-06-01
Content-Type: application/json

{ "model": OPENCODE_GO_MODEL, "max_tokens": 2000,
  "messages": [ { "role": "user", "content": userPrompt } ] }
```

> Protokol Anthropic memakai header **`x-api-key`**, bukan `Authorization: Bearer`.
> Kalau salah, server membalas `401 "Missing API key."`

### `openai`

```
POST {OPENCODE_GO_BASE_URL}/v1/chat/completions
Authorization: Bearer ${OPENCODE_GO_API_KEY}
Content-Type: application/json

{ "model": OPENCODE_GO_MODEL,
  "messages": [ { "role": "user", "content": userPrompt } ] }
```

### Ganti model

Ubah `OPENCODE_GO_MODEL` (mis. `kimi-k2.7`, `deepseek-v4-pro`, `glm-5.2`, atau model
OpenAI-compatible lain), sesuaikan `OPENCODE_GO_PROVIDER_TYPE`, lalu restart `api` +
`analyzer`. Tidak ada perubahan kode.

---

## 4. Alur "buka PDF → field terisi"

1. **Upload** — `web` minta presigned PUT, file di-PUT langsung ke MinIO.
2. **Extract** — `extractor` mengunduh PDF, menjalankan PyMuPDF, dan menyimpan hasil
   ke tabel `extractions` (`full_text`, `sections`, `metadata`).
3. **Analyze** — `extractor` meng-enqueue `ANALYZE`. `analyzer` membentuk konteks
   dari teks + PDF dan, per field, mengirimnya ke OpenCode Go. Hasil ditulis ke
   `analysis_sections`.
4. **Tampil** — `web` menerima status live via SSE dan menampilkan ke-48 field.

---

## 5. Keamanan (ringkas)

- Key dibaca **hanya** dari `process.env.OPENCODE_GO_API_KEY` di backend.
- Tak pernah dikirim ke browser, bundle, log, response JSON, atau pesan error.
- Backend tak me-log header auth maupun isi prompt.
- Login Cognito wajib sebelum request AI. Rate limit per-user **dan** global.
- Input di-sanitasi (trim + batas panjang); `max_tokens` dibatasi.
- Timeout + **retry sekali** hanya untuk error jaringan transien.
- Tiap request dicatat di `ai_usage`
  (`user_id, model, input_length, status, latency_ms, created_at`) — **tanpa**
  prompt dan **tanpa** key.
