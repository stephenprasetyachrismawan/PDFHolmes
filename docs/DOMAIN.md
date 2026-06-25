# PDFHo!mes — Setup Domain Sendiri

Panduan untuk deploy menggunakan domain pribadi (contoh: `pdfholmes.stevewithcode.net`).
Bila belum punya domain, pakai [`docs/RUNBOOK-sslip.md`](./RUNBOOK-sslip.md).

---

## 0. Yang disiapkan dulu

- Domain aktif (panel DNS bisa diakses).
- EC2 berjalan dengan **Elastic IP** (IP tetap).
- `.env.prod` belum diisi (atau mau diupdate).

---

## 1. Elastic IP (wajib, supaya DNS tidak berubah)

Console: EC2 → Network & Security → **Elastic IPs** → Allocate → Associate ke instance.
Catat IP, misal `1.2.3.4`.

---

## 2. Set A-record di panel DNS

Masuk panel DNS registrar/hosting-mu (biznetgio, Cloudflare, dll).
Tambah record berikut (ganti `1.2.3.4` dengan EIP-mu):

| Type | Name / Host | Value | TTL |
|---|---|---|---|
| A | `pdfholmes` | `1.2.3.4` | 300 |
| A | `minio.pdfholmes` | `1.2.3.4` | 300 |
| A | `console.pdfholmes` | `1.2.3.4` | 300 |
| A | `portainer.pdfholmes` | `1.2.3.4` | 300 |

**Atau** pakai wildcard (lebih ringkas, hasilnya sama):

| Type | Name / Host | Value |
|---|---|---|
| A | `pdfholmes` | `1.2.3.4` |
| A | `*.pdfholmes` | `1.2.3.4` |

> **Format "Name"** tergantung panel. Beberapa panel minta bentuk relatif (`pdfholmes`),
> beberapa minta FQDN penuh (`pdfholmes.stevewithcode.net.`). Kalau ragu, coba bentuk
> relatif dulu.

---

## 3. Cek propagasi DNS

Propagasi bisa 5 menit sampai beberapa jam. Cek dengan:

```bash
dig +short pdfholmes.stevewithcode.net
dig +short minio.pdfholmes.stevewithcode.net
dig +short console.pdfholmes.stevewithcode.net
```

Lanjut ke langkah berikutnya hanya setelah semua sudah keluar IP benar (`1.2.3.4`).

---

## 4. Pastikan port 80 + 443 terbuka di Security Group EC2

Caddy butuh port 80 reachable untuk ACME HTTP-01 challenge agar TLS bisa terbit otomatis.

EC2 → Security Groups → Inbound rules:

| Type | Port | Source |
|---|---|---|
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 |
| SSH | 22 | My IP |

---

## 5. Isi `.env.prod` di EC2

Ganti `pdfholmes.example.com` (atau placeholder lain) dengan domain-mu:

```env
NEXTAUTH_URL=https://pdfholmes.stevewithcode.net
NEXT_PUBLIC_API_URL=https://pdfholmes.stevewithcode.net/api
WEB_ORIGIN=https://pdfholmes.stevewithcode.net
MINIO_PUBLIC_ENDPOINT=https://minio.pdfholmes.stevewithcode.net
MINIO_CONSOLE_URL=https://console.pdfholmes.stevewithcode.net
BASE_DOMAIN=pdfholmes.stevewithcode.net
ACME_EMAIL=email-mu@contoh.com
```

Nilai lain (DB, Redis, Cognito, OpenCode Go) ikuti [`docs/DEPLOY.md`](./DEPLOY.md).

---

## 6. Update Cognito App Client

Di Cognito → App clients → pilih client PDFHolmes → Edit:

- **Callback URL (Return URL)**:
  ```
  https://pdfholmes.stevewithcode.net/api/auth/callback/cognito
  ```
  Tambah juga URL dev kalau perlu:
  ```
  http://localhost:3000/api/auth/callback/cognito
  ```

- **Sign-out URL**:
  ```
  https://pdfholmes.stevewithcode.net
  ```

Simpan perubahan.

---

## 7. Migrasi DB + jalankan

```bash
PC="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file .env.prod"

$PC run --rm --build migrate     # "Migrasi selesai."
$PC up -d --build                # build + jalankan semua service
```

---

## 8. Cek TLS + health

```bash
$PC logs proxy | grep -i "certificate obtained"   # sertifikat terbit
curl https://pdfholmes.stevewithcode.net/api/health
curl https://pdfholmes.stevewithcode.net/api/health/ready
```

TLS otomatis diurus Caddy (Let's Encrypt). Tidak perlu setup cert manual.

---

## 9. Akses

| URL | Layanan |
|---|---|
| `https://pdfholmes.stevewithcode.net` | Aplikasi utama |
| `https://minio.pdfholmes.stevewithcode.net` | MinIO API |
| `https://console.pdfholmes.stevewithcode.net` | MinIO Console |
| `https://portainer.pdfholmes.stevewithcode.net` | Portainer (monitoring Docker) |

> **Portainer**: buat akun admin segera setelah pertama buka — ada jendela waktu
> singkat sebelum otomatis terkunci.

---

## Troubleshooting

| Gejala | Kemungkinan penyebab | Solusi |
|---|---|---|
| TLS tidak terbit | Port 80 belum publik | Cek SG EC2 |
| TLS tidak terbit | DNS belum propagasi | `dig` lagi, tunggu |
| `502 Bad Gateway` | Service belum ready | `$PC logs api` |
| Login Cognito gagal redirect | Callback URL salah | Update App client Cognito |
| `dig` keluar IP lain | A-record salah | Cek panel DNS, hapus record lama |
