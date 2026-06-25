# PDFHo!mes — DB sebagai Container di EC2 (tanpa Aurora)

Untuk akun AWS **Free plan** yang menolak buat Aurora
(`FreeTierRestrictionError: To use Aurora clusters with free plan accounts...`)
atau bila mau hemat penuh. DB jalan sebagai container **Postgres + pgvector**
di EC2, dengan volume persisten.

Trade-off vs Aurora:
- ✅ Gratis (ikut biaya EC2), tak perlu upgrade plan.
- ⚠️ Data ada di EBS EC2 — **tak ada auto-backup managed**. Snapshot EBS manual
  bila perlu. Kalau instance/storage rusak tanpa snapshot → data hilang.
- ⚠️ Tak ada failover/replika otomatis.

Cukup untuk demo, skripsi, atau beban kecil.

---

## 1. Terraform: matikan Aurora (hanya Cognito)

`infra/aws/terraform.tfvars`:
```hcl
enable_aurora = false      # default — Aurora tidak dibuat
```

```bash
cd infra/aws
terraform apply        # hanya Cognito (User Pool, App client, Hosted UI domain)
```

Bila sebelumnya sempat `apply` dengan Aurora (lalu gagal di RDS), `apply` ulang
dengan `enable_aurora=false` akan **menghapus** sisa resource Aurora (secret,
subnet group, SG) dan menyisakan Cognito. Ketik `yes`.

Ambil output Cognito:
```bash
terraform output cognito_issuer
terraform output cognito_jwks_url
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output -raw cognito_client_secret
```

---

## 2. `.env.prod`: arahkan DATABASE_URL ke container `db`

Ganti blok DB. **Jangan** pakai endpoint Aurora.
```env
# DB container (bukan Aurora)
POSTGRES_USER=app
POSTGRES_PASSWORD=<password kuat — generate: openssl rand -hex 24>
POSTGRES_DB=pdfholmes
DATABASE_URL=postgres://app:<password kuat sama>@db:5432/pdfholmes
```
`POSTGRES_PASSWORD` dan password di `DATABASE_URL` **harus sama persis**.
Host = `db` (nama service compose), bukan `localhost`.

> **Pakai `openssl rand -hex 24`** (URL-safe). JANGAN `-base64` — bisa
> mengandung `/` `+` `=` yang merusak parsing `DATABASE_URL` (password
> ke-truncate walau `POSTGRES_PASSWORD` benar). Bila terlanjur pakai base64,
> percent-encode dulu sebelum menaruh di `DATABASE_URL`.

Sisanya (Cognito, MinIO, OpenCode Go, dst) sama seperti `docs/DOMAIN.md`.

---

## 3. Jalankan dengan override `localdb`

Tambah `-f infra/docker-compose.localdb.yml` ke perintah compose:

```bash
PC="docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  -f infra/docker-compose.localdb.yml \
  --env-file .env.prod"

$PC run --rm --build migrate     # → "Migrasi selesai."
$PC up -d --build
```

Override ini menambah service `db` (Postgres+pgvector, volume `db_data`),
membuat `migrate`/`api`/`extractor`/`analyzer` menunggu DB sehat, dan **tidak**
mengekspos 5432 ke host (hanya jaringan internal compose).

---

## 4. Verifikasi

```bash
$PC ps                                       # db = healthy
curl https://pdfholmes.stevewithcode.net/api/health/ready    # db+redis ok
```

---

## Backup manual (disarankan)

```bash
# dump ke file (di EC2)
$PC exec db pg_dump -U app pdfholmes > backup_$(date +%F).sql

# restore
cat backup_YYYY-MM-DD.sql | $PC exec -T db psql -U app -d pdfholmes
```
Atau snapshot EBS EC2 berkala via AWS console.

---

## Pindah ke Aurora nanti

Bila akun sudah Paid plan dan mau DB managed:
1. `enable_aurora = true` di `terraform.tfvars` → `terraform apply`.
2. Ambil `DATABASE_URL` dari Secrets Manager (lihat `docs/DEPLOY.md`).
3. Migrasi data (`pg_dump` dari container → `psql` ke Aurora).
4. Set `DATABASE_URL` Aurora di `.env.prod`, jalankan **tanpa**
   `-f docker-compose.localdb.yml`.
