# Deploy PDFHo!mes di EC2

Panduan ini membangun PDFHo!mes dari nol sampai berjalan publik dengan HTTPS, login
Cognito, dan AI OpenCode Go — semuanya sebagai container Docker di satu instance EC2.
Database adalah Postgres dalam container (lihat [`DATABASE.md`](./DATABASE.md)).

Garis besar:
1. Siapkan AWS + domain.
2. Provision Cognito (Terraform).
3. Luncurkan EC2 + Docker.
4. Isi `.env`, jalankan stack.
5. Arahkan DNS, Caddy menerbitkan TLS.
6. Cek go-live.

---

## 1. Prasyarat

- Akun AWS + kredensial (`aws configure`; cek `aws sts get-caller-identity`).
- Domain yang DNS-nya bisa Anda atur (contoh: `pdfholmes.stevewithcode.net`).
- Langganan OpenCode Go + API key (lihat [`OPENCODE.md`](./OPENCODE.md)).
- Terraform ≥ 1.6.

---

## 2. Provision Cognito

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars   # isi domain, cognito_domain_prefix, region
terraform init && terraform apply
```

Ambil outputnya untuk `.env` (issuer, jwks_url, client_id, client_secret,
user_pool_id). Langkah lengkap + pemetaan env: [`COGNITO.md`](./COGNITO.md).

---

## 3. EC2 + Docker

1. Luncurkan EC2 **Graviton** (`t4g.medium`/`t4g.large`) dengan **Elastic IP** agar
   IP tetap.
2. EBS gp3 ~40GB.
3. Security Group: **80/443 publik**, **22 hanya IP Anda**.
4. Pasang Docker:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
   sudo systemctl enable --now docker && sudo usermod -aG docker $USER
   ```

---

## 4. Konfigurasi `.env`

```bash
git clone <repo> pdfholmes && cd pdfholmes
cp .env.example .env
```

Isi minimal:

```env
# Domain (web + API satu origin)
WEB_DOMAIN=pdfholmes.stevewithcode.net
NEXTAUTH_URL=https://pdfholmes.stevewithcode.net
NEXT_PUBLIC_API_URL=https://pdfholmes.stevewithcode.net/api
WEB_ORIGIN=https://pdfholmes.stevewithcode.net

# MinIO presigned (boleh subdomain lain bila DNS-nya ada;
# sslip.io memetakan IP→hostname tanpa perlu set DNS)
MINIO_DOMAIN=minio.<elastic-ip>.sslip.io
MINIO_PUBLIC_ENDPOINT=https://minio.<elastic-ip>.sslip.io
MINIO_ROOT_USER=<ganti>
MINIO_ROOT_PASSWORD=<password kuat>

# Login Cognito (dari output Terraform) — TANPA bypass
AUTH_DEV_BYPASS=false
NEXTAUTH_SECRET=<openssl rand -base64 32>
COGNITO_REGION=ap-southeast-1
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...
COGNITO_CLIENT_SECRET=...
COGNITO_ISSUER=...
COGNITO_JWKS_URL=...

# Database container (lihat DATABASE.md)
POSTGRES_USER=app
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB=pdfholmes
DATABASE_URL=postgres://app:<password sama>@db:5432/pdfholmes

# AI (lihat OPENCODE.md)
OPENCODE_GO_API_KEY=sk-...
```

---

## 5. Jalankan

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.dev.yml \
  --env-file .env up -d
```

File compose kedua menambahkan service `db` (Postgres + pgvector). Service `migrate`
membuat tabel + ekstensi otomatis sebelum `api` mulai.

---

## 6. DNS + TLS

Arahkan A-record domain ke Elastic IP EC2:

| Type | Name | Value |
|---|---|---|
| A | `pdfholmes` | `<elastic-ip>` |

MinIO memakai host `sslip.io` yang resolve otomatis ke IP (tanpa DNS manual). Caddy
menerbitkan sertifikat Let's Encrypt sendiri — port 80 harus reachable untuk
tantangan HTTP-01. Detail DNS: [`DOMAIN.md`](./DOMAIN.md).

---

## 7. Verifikasi

```bash
curl https://pdfholmes.stevewithcode.net/api/health         # {"status":"ok"}
curl https://pdfholmes.stevewithcode.net/api/health/ready   # db + redis ok
```

Buka `https://pdfholmes.stevewithcode.net` → login Cognito → unggah PDF → field
analisis terisi.

---

## 8. Checklist go-live keamanan

- [ ] `AUTH_DEV_BYPASS=false` dan login Cognito berfungsi.
- [ ] `NEXTAUTH_SECRET` di-generate, bukan contoh.
- [ ] `OPENCODE_GO_API_KEY` diisi & **tidak** memakai prefix `NEXT_PUBLIC_`.
- [ ] Kredensial MinIO default sudah diganti; console MinIO tak diekspos publik.
- [ ] HTTPS aktif (Caddy) di domain web + endpoint MinIO.
- [ ] Rate limit AI aktif (Throttler global + per-user/global via Redis).
- [ ] Backup DB dijadwalkan (`pg_dump` / snapshot EBS) — lihat [`DATABASE.md`](./DATABASE.md).
- [ ] Hanya port 80/443/22 terbuka; 22 dibatasi IP Anda.

---

## 9. Operasional

- **Log**: `docker compose ... logs -f api analyzer extractor`.
- **Update**: `git pull && docker compose ... up -d --build`.
- **Hemat biaya**: stop EC2 di luar jam pakai. (Catatan: kalau Elastic IP tidak
  dipakai, IP-nya tetap; tanpa Elastic IP, IP berubah dan DNS harus diperbarui.)
- **Migrasi baru**: tambah `db/migrations/000X_*.sql`, jalankan service `migrate`.
- **Scale**: tambah replika `analyzer`/`extractor` (`--scale analyzer=2`) saat
  antrean menumpuk.
