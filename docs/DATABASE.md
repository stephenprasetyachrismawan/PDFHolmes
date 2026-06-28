# Database — Postgres + pgvector dalam Container

PDFHo!mes menyimpan datanya di **Postgres 16 dengan ekstensi pgvector**, berjalan
sebagai container Docker di host EC2 yang sama dengan service lain. Datanya bertahan
di volume `db_data`.

Pilihan ini sederhana dan murah: tidak ada database managed terpisah, semuanya
hidup di satu instance. Yang perlu Anda ingat: backup adalah tanggung jawab Anda
(lihat bagian Backup di bawah) — tidak ada snapshot otomatis seperti layanan
managed.

---

## Konfigurasi

Database disetel lewat empat baris di `.env`:

```env
POSTGRES_USER=app
POSTGRES_PASSWORD=<password kuat>
POSTGRES_DB=pdfholmes
DATABASE_URL=postgres://app:<password kuat>@db:5432/pdfholmes
```

Dua hal yang sering bikin gagal:

- **Password di `POSTGRES_PASSWORD` dan di `DATABASE_URL` harus sama persis.**
- **Host-nya `db`** (nama service compose), bukan `localhost`.

> Buat password dengan `openssl rand -hex 24` — hasilnya aman dipakai di URL.
> Hindari `-base64`: karakter `/` `+` `=` bisa merusak parsing `DATABASE_URL`.

---

## Bagaimana ia dijalankan

Service `db` ditambahkan oleh file override compose kedua, dan `migrate`/`api`/
`extractor`/`analyzer` menunggu sampai DB sehat sebelum mulai:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.dev.yml \
  --env-file .env up -d
```

Migrasi (membuat tabel + mengaktifkan ekstensi `vector` dan `pgcrypto`) dijalankan
otomatis oleh service `migrate`. Port 5432 tidak diekspos keluar — hanya jaringan
internal compose yang bisa mengaksesnya.

Verifikasi:

```bash
docker compose ... ps                                        # db = healthy
curl https://pdfholmes.stevewithcode.net/api/health/ready    # db + redis ok
```

---

## Tabel inti

| Tabel | Isi |
|---|---|
| `users` | Pengguna (sinkron dari Cognito) + nama bucket MinIO-nya |
| `folders` | Folder bertingkat milik pengguna |
| `documents` | Metadata PDF + status siklus hidup |
| `extractions` | Hasil parser: `full_text`, `sections`, `metadata` (1:1 ke documents) |
| `analyses` | Satu sesi analisis (bahasa, model) |
| `analysis_sections` | 48 field hasil + `embedding` (pgvector) |
| `ai_usage` | Audit pemakaian AI (tanpa prompt, tanpa key) |

---

## Backup

Tidak ada backup otomatis — jadwalkan sendiri. Cara paling mudah, dump ke file:

```bash
PC="docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml --env-file .env"

# Backup
$PC exec db pg_dump -U app pdfholmes > backup_$(date +%F).sql

# Restore
cat backup_YYYY-MM-DD.sql | $PC exec -T db psql -U app -d pdfholmes
```

Untuk perlindungan tambahan, ambil snapshot EBS instance EC2 secara berkala.

---

## Menambah migrasi

Tambahkan file baru `db/migrations/000X_nama.sql`, lalu jalankan ulang service
`migrate`:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml \
  --env-file .env run --rm migrate
```
