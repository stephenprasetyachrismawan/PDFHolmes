# OpenCode Go sebagai penyedia AI tunggal

Analisis 48 field PDFHo!mes ditenagai satu penyedia: OpenCode Go. Aplikasi ini bukan
BYOK. Pengguna tidak pernah memasukkan API key. Seluruh aplikasi memakai satu langganan
yang disetel di server.

Karena semua pengguna berbagi langganan yang sama, kuota bisa habis kalau pemakaian
total tinggi. Pilih paket sesuai perkiraan beban, dan perhatikan batas token saat
menyetel `OPENCODE_GO_BATCH_MAX_TOKENS`.

## 1. Berlangganan dan ambil key

1. Buat akun di OpenCode Go dan pilih paket. Catat batas token dan permintaannya.
2. Di dasbor, buka API Keys, lalu buat key baru (misalnya `pdfholmes-prod`).
3. Salin saat itu juga, karena biasanya key hanya ditampilkan sekali. Simpan di password
   manager.

## 2. Masukkan ke `.env`

Key hanya boleh ada di env sisi-server. Jangan memberi prefix `NEXT_PUBLIC_`, karena itu
akan membocorkannya ke bundle browser.

```env
OPENCODE_GO_API_KEY=sk-...            # dari langkah 1
OPENCODE_GO_MODEL=glm-5.2             # model yang dipakai analyzer
OPENCODE_GO_PROVIDER_TYPE=openai      # anthropic | openai
OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go

# Parameter analisis batch (nilai default ditampilkan)
OPENCODE_GO_BATCH_MAX_TOKENS=16000   # ruang output untuk satu jawaban berisi 48 field
OPENCODE_GO_TIMEOUT_S=900            # batas waktu satu panggilan, detik
OPENCODE_GO_REASONING_EFFORT=low     # hanya untuk provider_type=openai (lihat bagian 5)
MAX_CONTEXT_CHARS=24000              # batas potongan teks paper yang dikirim ke model
```

Hanya `analyzer` yang memanggil OpenCode Go. Setelah mengubah env ini, restart service
tersebut:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d analyzer
```

Coba dengan mengunggah PDF lalu menunggu field analisis terisi. Kotak "Log pemrosesan"
di bawah halaman dokumen menampilkan panggilan AI dan potongan respons mentahnya, jadi
Anda bisa memastikan model menjawab.

> Catatan: service `api` di Compose masih menerima beberapa env lama dari fitur chat
> yang sudah dihapus (`OPENCODE_GO_MAX_INPUT_CHARS`, `OPENCODE_GO_TIMEOUT_MS`,
> `OPENCODE_GO_USER_RATE_PER_MIN`, `OPENCODE_GO_GLOBAL_RATE_PER_MIN`). Env itu tidak lagi
> dipakai jalur AI mana pun dan aman diabaikan.

## 3. Cara analisis dikerjakan

`analyzer` tidak memanggil model 48 kali. Worker menyusun satu prompt berisi konteks
paper (dibatasi `MAX_CONTEXT_CHARS`) dan deskripsi ke-48 field, lalu mengirim satu
panggilan. Model membalas satu JSON `{field_key: {content, source, confidence}}`. Worker
memisah JSON itu dan menyimpan tiap field ke `analysis_sections`.

Satu panggilan menghemat token, karena konteks paper hanya dikirim sekali, dan
menghindari rate limit dibanding 48 panggilan paralel. Parser tahan terhadap jawaban
terpotong: kalau JSON kehilangan field di ujung, field itu diisi "Tidak dinyatakan dalam
teks." dan sisanya tetap tersimpan.

## 4. Routing per protokol

`OPENCODE_GO_PROVIDER_TYPE` menentukan endpoint, bentuk body, dan header auth.

### anthropic

```
POST {OPENCODE_GO_BASE_URL}/v1/messages
x-api-key: ${OPENCODE_GO_API_KEY}
anthropic-version: 2023-06-01
Content-Type: application/json

{ "model": OPENCODE_GO_MODEL, "max_tokens": 16000,
  "system": "...", "messages": [ { "role": "user", "content": "..." } ] }
```

Protokol Anthropic memakai header `x-api-key`, bukan `Authorization: Bearer`. Kalau
salah, server membalas `401 "Missing API key."`

### openai

```
POST {OPENCODE_GO_BASE_URL}/v1/chat/completions
Authorization: Bearer ${OPENCODE_GO_API_KEY}
Content-Type: application/json

{ "model": OPENCODE_GO_MODEL, "max_tokens": 16000,
  "messages": [ { "role": "system", "content": "..." },
                { "role": "user", "content": "..." } ] }
```

### Ganti model

Ubah `OPENCODE_GO_MODEL` (misalnya `kimi-k2.7`, `deepseek-v4-pro`, `glm-5.2`, atau model
OpenAI-compatible lain), sesuaikan `OPENCODE_GO_PROVIDER_TYPE`, lalu restart `analyzer`.
Tidak ada perubahan kode.

## 5. Model reasoning (GLM-5.2)

Default deployment ini memakai GLM-5.2 lewat provider_type `openai`. GLM-5.2 adalah model
reasoning: jawaban akhir ada di `message.content`, sedangkan proses berpikirnya ada di
`message.reasoning_content`. Reasoning bisa menghabiskan sebagian besar token dan waktu,
sehingga batch 48 field bisa lewat 10 menit kalau dibiarkan penuh.

Dua parameter menjinakkannya:

- `OPENCODE_GO_REASONING_EFFORT=low` memangkas reasoning. Tugas ekstraksi terstruktur
  tidak butuh berpikir dalam, dan ini menurunkan waktu batch dari ratusan detik menjadi
  sekitar tiga menit. Nilai `none` mematikan reasoning sepenuhnya. Untuk model
  non-reasoning, kosongkan parameter ini agar tidak ikut terkirim.
- `OPENCODE_GO_TIMEOUT_S=900` memberi ruang waktu untuk dokumen besar. Sebelumnya batas
  300 detik membuat PDF 4 MB kena `The read operation timed out`. Klien HTTP memakai
  connect timeout pendek (15 detik) tapi read timeout longgar, jadi koneksi yang mati
  tetap gagal cepat sementara jawaban yang lama tetap ditunggu.

## 6. Keamanan (ringkas)

- Key dibaca hanya dari `OPENCODE_GO_API_KEY` di backend `analyzer`.
- Key tidak pernah dikirim ke browser, bundle, log, body response, atau pesan error.
- Backend tidak me-log header auth maupun isi prompt.
- Konteks ke model dibatasi `MAX_CONTEXT_CHARS`, dan `max_tokens` jawaban dibatasi.
- Endpoint yang memicu analisis butuh login Cognito dan dibatasi NestJS Throttler.
