# DNS, Elastic IP, dan TLS

PDFHo!mes dilayani di satu domain — web dan API berbagi origin yang sama
(`pdfholmes.stevewithcode.net`). MinIO (untuk presigned upload/download) memakai
host `sslip.io` yang resolve otomatis ke IP, jadi hanya satu A-record yang perlu
Anda atur.

---

## 1. Elastic IP

Pakai Elastic IP agar IP instance tidak berubah saat di-restart.

Console: EC2 → Network & Security → **Elastic IPs** → Allocate → Associate ke
instance. Catat IP-nya, misal `52.74.175.80`.

> Tanpa Elastic IP, IP publik EC2 berubah setiap stop/start. Kalau itu terjadi,
> A-record DNS dan `MINIO_DOMAIN`/`MINIO_PUBLIC_ENDPOINT` (yang memuat IP) harus
> diperbarui, lalu `web` di-rebuild karena URL API tertanam saat build.

---

## 2. A-record di panel DNS

Di panel DNS domain Anda, tambah satu record (ganti dengan Elastic IP Anda):

| Type | Name / Host | Value | TTL |
|---|---|---|---|
| A | `pdfholmes` | `52.74.175.80` | 300 |

MinIO **tidak** perlu record sendiri: `minio.<ip>.sslip.io` sudah otomatis
menunjuk ke `<ip>`.

> Format "Name" tergantung panel: ada yang minta bentuk relatif (`pdfholmes`), ada
> yang minta FQDN (`pdfholmes.stevewithcode.net.`). Coba bentuk relatif dulu.

---

## 3. Cek propagasi

```bash
dig +short pdfholmes.stevewithcode.net      # harus keluar Elastic IP Anda
```

Lanjut hanya setelah IP yang benar muncul.

---

## 4. Port di Security Group

Caddy butuh port 80 reachable untuk tantangan ACME HTTP-01 agar TLS terbit otomatis.

| Type | Port | Source |
|---|---|---|
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 |
| SSH | 22 | My IP |

---

## 5. `.env`: domain

```env
WEB_DOMAIN=pdfholmes.stevewithcode.net
NEXTAUTH_URL=https://pdfholmes.stevewithcode.net
NEXT_PUBLIC_API_URL=https://pdfholmes.stevewithcode.net
WEB_ORIGIN=https://pdfholmes.stevewithcode.net

MINIO_DOMAIN=minio.52.74.175.80.sslip.io
MINIO_PUBLIC_ENDPOINT=https://minio.52.74.175.80.sslip.io
```

`WEB_DOMAIN` dan `MINIO_DOMAIN` dipakai Caddy untuk membuat vhost dan menerbitkan
TLS. `NEXT_PUBLIC_API_URL` tertanam ke bundle web saat build — jadi setelah
mengubahnya, **rebuild `web`**.

---

## 6. Callback Cognito

App client Cognito hanya menerima callback yang persis terdaftar. Pastikan ada:

```
Callback : https://pdfholmes.stevewithcode.net/api/auth/callback/cognito
Sign-out : https://pdfholmes.stevewithcode.net
```

Ini disetel oleh Terraform dari variabel `domain` (lihat [`COGNITO.md`](./COGNITO.md)).
Kalau mengubahnya manual, lakukan di Cognito → App clients → Edit.

---

## 7. Jalankan + cek TLS

```bash
PC="docker compose -f infra/docker-compose.yml --env-file .env"

$PC up -d --build web                       # rebuild bila domain berubah
$PC logs proxy | grep -i "certificate obtained"
curl https://pdfholmes.stevewithcode.net/api/health
```

TLS sepenuhnya diurus Caddy — tidak ada cert manual.

---

## Troubleshooting

| Gejala | Kemungkinan penyebab | Solusi |
|---|---|---|
| TLS tidak terbit | Port 80 belum publik | cek Security Group EC2 |
| TLS tidak terbit | DNS belum propagasi | `dig` lagi, tunggu |
| `502 Bad Gateway` | service belum siap | `$PC logs api` |
| Login Cognito gagal redirect | callback URL salah | perbarui App client Cognito |
| Upload PDF gagal/timeout | `MINIO_*` masih IP lama | samakan dengan Elastic IP, rebuild web |
| `dig` keluar IP lain | A-record salah | cek panel DNS, hapus record lama |
