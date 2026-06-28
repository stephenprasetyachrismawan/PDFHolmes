# Terraform — Cognito + Aurora (PDFHo!mes)

Terraform di sini menyiapkan **Amazon Cognito** (User Pool, Hosted UI domain, App
client) untuk login dan komponen pendukung **Aurora** (secret + security group).
Database aplikasi adalah **Aurora PostgreSQL dengan IAM auth** — lihat
[`../../docs/DATABASE.md`](../../docs/DATABASE.md) untuk user `app`, role `rds_iam`,
dan instance role EC2.

## Prasyarat

- Terraform ≥ 1.6 dan kredensial AWS (`aws configure` / env / SSO).
- Domain web publik sudah ditentukan (dipakai untuk callback Cognito).

## Pakai

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars   # isi domain, cognito_domain_prefix, region
terraform init
terraform plan
terraform apply
```

## Ambil output untuk `.env`

```bash
terraform output cognito_issuer
terraform output cognito_jwks_url
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output -raw cognito_client_secret   # rahasia
```

Pemetaan output → variabel `.env`: [`../../docs/COGNITO.md`](../../docs/COGNITO.md).

## Catatan

- App client hanya menerima callback `https://<domain>/api/auth/callback/cognito`.
  Kalau domain web berubah, ubah variabel `domain` lalu `terraform apply`.
- Ekstensi `vector`/`pgcrypto` diaktifkan oleh migrasi aplikasi
  (`db/migrations/0001_init.sql`), bukan Terraform.
- `terraform destroy` menghapus User Pool Cognito — **semua pengguna ikut hilang**.
  Hati-hati di produksi.
