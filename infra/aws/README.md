# Terraform — Cognito + Aurora (PDFHo!mes)

Provisioning identitas (Cognito) + database (Aurora Serverless v2) untuk produksi (§11–12).

## Prasyarat
- Terraform ≥ 1.6, kredensial AWS (`aws configure` / env / SSO).
- Domain web publik sudah ditentukan (callback Cognito).

## Pakai
```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars   # isi domain, prefix, region, CIDR
terraform init
terraform plan
terraform apply
```

## Setelah apply — ambil output utk .env produksi
```bash
terraform output cognito_issuer
terraform output cognito_jwks_url
terraform output cognito_client_id
terraform output -raw cognito_client_secret
terraform output aurora_endpoint
terraform output -raw database_secret_arn   # DATABASE_URL lengkap ada di secret ini
```

Lihat `docs/DEPLOY.md` untuk pemetaan output → variabel `.env` dan langkah migrasi.

## Catatan
- `aurora_min_acu = 0` → auto-pause saat idle (hemat) tapi cold start ±15 dtk. Prod dgn user aktif: set `0.5`.
- SG Aurora hanya buka 5432 dari `allowed_app_cidr`. Set ke CIDR subnet EC2 host.
- Ekstensi `vector`/`pgcrypto` diaktifkan oleh migrasi aplikasi (`db/migrations/0001_init.sql`), bukan Terraform.
- `terraform destroy` menghapus Cognito pool + Aurora (skip_final_snapshot=true). Hati-hati di prod.
