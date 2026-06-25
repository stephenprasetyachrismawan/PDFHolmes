# PDFHo!mes — Panduan Deploy Produksi (Aurora + Cognito + EC2)

Fase 7 arsitektur (§11–16). Hasil akhir: app publik HTTPS, identitas Cognito,
database Aurora, worker AI berjalan di 1 EC2 (Docker Compose).

Ringkas alur:
1. Provision **Cognito** + **Aurora** (Terraform atau Console).
2. Luncurkan **EC2** + Docker.
3. Isi `.env.prod`, jalankan migrasi, `compose up`.
4. Arahkan domain, Caddy terbitkan TLS.
5. Hardening (§16) + cek go-live.

---

## 0. Prasyarat
- Akun AWS + kredensial (`aws configure`).
- Domain (mis. `pdfholmes.example.com`) yang bisa diatur DNS-nya.
- Terraform ≥ 1.6 (opsi A) **atau** akses Console (opsi B).

---

## 1A. Provision via Terraform (disarankan)

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars
#   isi: region, domain, cognito_domain_prefix (unik global),
#        allowed_app_cidr (CIDR subnet EC2), vpc_id (kosong=default VPC)
terraform init && terraform apply
```

Ambil output → ini langsung jadi nilai `.env.prod`:

| Terraform output | Variabel `.env.prod` |
|---|---|
| `cognito_issuer` | `COGNITO_ISSUER` |
| `cognito_jwks_url` | `COGNITO_JWKS_URL` |
| `cognito_user_pool_id` | `COGNITO_USER_POOL_ID` |
| `cognito_client_id` | `COGNITO_CLIENT_ID` |
| `cognito_client_secret` (`-raw`) | `COGNITO_CLIENT_SECRET` |
| `aurora_endpoint` | host di `DATABASE_URL` |
| `database_secret_arn` | berisi `DATABASE_URL` lengkap |

```bash
# DATABASE_URL lengkap (user+password+host) ada di Secrets Manager:
aws secretsmanager get-secret-value \
  --secret-id pdfholmes/aurora/credentials \
  --query SecretString --output text | jq -r .url
```

---

## 1B. Provision via Console (alternatif manual)

### Cognito (§11)
1. **Cognito → Create user pool**, tier **Essentials**.
2. Sign-in option = **Email**; aktifkan **verifikasi email**.
3. Password policy sesuai kebutuhan; MFA = optional (TOTP).
4. **App client** (SPA/public-confidential): aktifkan **Authorization code grant**,
   scope `openid email profile`.
   - Callback URL: `https://pdfholmes.example.com/api/auth/callback/cognito`
   - Sign-out URL: `https://pdfholmes.example.com`
   - Generate **client secret** (Auth.js memakainya).
5. **Hosted UI domain**: set prefix unik.
6. Catat: User Pool ID, Client ID, Client secret, region.
   - `COGNITO_ISSUER = https://cognito-idp.<region>.amazonaws.com/<userPoolId>`
   - `COGNITO_JWKS_URL = <issuer>/.well-known/jwks.json`

### Aurora (§12)
1. **RDS → Create database → Aurora (PostgreSQL)**, versi **16.x** (dukung scale-to-zero).
2. **Serverless v2**: **Min ACU = 0** (auto-pause idle) / **Max ACU = 2**.
   - Prod dgn user aktif: Min ACU **0.5** agar hangat (hindari cold start ±15s).
3. Enkripsi at rest (default KMS) **on**.
4. Jaringan: **subnet privat**; Security Group izinkan **5432 hanya dari SG/CIDR EC2**. Jangan publik.
5. Buat DB `pdfholmes`. Simpan kredensial di **Secrets Manager**.

---

## 2. EC2 + Docker (§14)
1. Luncurkan EC2 **Graviton** (`t4g.large` 8GB jika GROBID aktif; `t4g.medium` tanpa GROBID).
2. EBS gp3 ~30GB. Security Group: **80/443 publik**, **22 hanya IP Anda**.
3. Pasang Docker + plugin compose:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
   sudo systemctl enable --now docker && sudo usermod -aG docker $USER
   ```
4. Pastikan EC2 berada di VPC/subnet yang SG-nya diizinkan Aurora (langkah 1).

---

## 3. Konfigurasi + migrasi
```bash
git clone <repo> pdfholmes && cd pdfholmes
cp .env.prod.example .env.prod
#   isi semua dari output Terraform/Console. WAJIB:
#   - AUTH_DEV_BYPASS=false
#   - NEXTAUTH_SECRET     = openssl rand -base64 32
#   - MINIO_ROOT_PASSWORD = password kuat (ganti default!)
#   - DATABASE_URL        = endpoint Aurora
#   - OPENCODE_GO_API_KEY = key langganan OpenCode Go (NON-BYOK)
#   - BASE_DOMAIN, ACME_EMAIL

# Migrasi DB (mengaktifkan extension vector/pgcrypto + buat tabel) ke Aurora:
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file .env.prod run --rm --build migrate
```

> Jika `CREATE EXTENSION vector` gagal: pastikan versi Aurora 16.x (pgvector tersedia)
> dan user punya hak. Bisa juga jalankan `CREATE EXTENSION vector;` manual via psql.

---

## 4. Build + jalankan
```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

### DNS
Arahkan A-record ke IP EC2:
- `pdfholmes.example.com` → web
- `minio.pdfholmes.example.com`, `console.pdfholmes.example.com`, `portainer.pdfholmes.example.com`

(atau wildcard `*.pdfholmes.example.com`). Caddy otomatis terbitkan TLS (port 80 harus
reachable utk tantangan HTTP-01).

---

## 5. Verifikasi
```bash
curl https://pdfholmes.example.com/api/health        # {"status":"ok"}
curl https://pdfholmes.example.com/api/health/ready   # db+redis ok
```
Buka `https://pdfholmes.example.com` → login Cognito (Hosted UI) → upload PDF →
field analisis terisi.

---

## 6. Checklist go-live keamanan (§16)
- [ ] `AUTH_DEV_BYPASS=false` (api menolak boot bila true + NODE_ENV=production).
- [ ] `NEXTAUTH_SECRET` di-generate, bukan contoh.
- [ ] `OPENCODE_GO_API_KEY` diisi & tak pakai prefix `NEXT_PUBLIC_` (tak bocor ke browser).
- [ ] Kredensial MinIO default DIGANTI; console (9001) tak diekspos publik.
- [ ] Aurora di subnet privat; SG 5432 dari EC2 saja.
- [ ] HTTPS aktif di semua host (Caddy).
- [ ] Rate limit AI aktif (Throttler global + per-user/global OpenCode Go via Redis).
- [ ] AI = OpenCode Go (NON-BYOK); pengguna tak memasukkan API key.
- [ ] Login Portainer dibuat saat pertama (admin) + password kuat.
- [ ] Backup: snapshot Aurora otomatis; pertimbangkan replikasi MinIO ke S3.

---

## 7. Operasional
- **Logs**: `docker compose ... logs -f api analyzer extractor`.
- **Update**: `git pull && docker compose ... up -d --build`.
- **Hemat biaya** (§15): stop EC2 di luar jam pakai; Aurora min ACU 0 auto-pause.
- **Migrasi baru**: tambah file `db/migrations/000X_*.sql`, jalankan service `migrate`.
- **Scale**: tambah replika `analyzer`/`extractor` (`--scale analyzer=2`) saat antrean menumpuk.
- **AI nyata**: set `OPENCODE_GO_API_KEY=...`, `ANALYZER_MOCK=false`, lalu `up -d api analyzer`. Lihat `docs/OPENCODE.md`.
