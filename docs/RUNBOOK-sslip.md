# Runbook Produksi via sslip.io (tanpa beli domain)

Target: PDFHo!mes publik HTTPS, auth Cognito, DB Aurora, di 1 EC2 + Elastic IP,
hostname `pdfholmes.<ELASTIC_IP>.sslip.io`.

Ganti `<EIP>` di seluruh dokumen dengan Elastic IP-mu (mis. 1.2.3.4).
Pakai SATU region konsisten utk semua (contoh: `ap-southeast-1`).

---

## 0. Yang disiapkan dulu
- Akun AWS aktif (kartu kredit terdaftar).
- Terraform ≥1.6 + AWS CLI di laptopmu.
- Tahu region pilihan.

---

## 1. Kredensial AWS CLI (laptop)
IAM → Users → Create user → attach policy `AdministratorAccess` (demo) →
Security credentials → Create access key (CLI).
```bash
aws configure
#   AWS Access Key ID     : AKIA...
#   AWS Secret Access Key : ...
#   Default region name   : ap-southeast-1
#   Default output format : json
aws sts get-caller-identity     # cek: muncul akun-mu
```

---

## 2. Elastic IP (IP tetap utk sslip.io)
Console: EC2 → Network & Security → **Elastic IPs** → Allocate → Allocate.
Catat IP, mis. `1.2.3.4`. Hostname-mu jadi `pdfholmes.1.2.3.4.sslip.io`.
(CLI: `aws ec2 allocate-address`)

> EIP gratis SELAMA nempel ke instance running. Kalau nganggur, kena charge kecil.

---

## 3. Luncurkan EC2
Console: EC2 → Launch instance.
- Name: `pdfholmes`
- AMI: **Ubuntu Server 24.04 LTS** (arsitektur **64-bit Arm**)
- Instance type: **t4g.large** (8GB, utk GROBID). Tanpa GROBID: `t4g.medium`.
- Key pair: buat baru (`.pem`) → simpan, ini utk SSH.
- Network: **default VPC**, subnet publik, **Auto-assign public IP = enable**.
- Storage: 30 GB gp3.
- **Security Group** (buat baru), inbound rules:
  | Type | Port | Source |
  |---|---|---|
  | SSH | 22 | My IP |
  | HTTP | 80 | 0.0.0.0/0 |
  | HTTPS | 443 | 0.0.0.0/0 |
- Launch.

Lalu: EC2 → Elastic IPs → pilih EIP → **Associate** → instance `pdfholmes`.
Sekarang `1.2.3.4` = IP tetap EC2.

---

## 4. Provision Cognito + Aurora (Terraform, dari laptop)
```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars
```
Edit `terraform.tfvars`:
```hcl
region                = "ap-southeast-1"
domain                = "pdfholmes.1.2.3.4.sslip.io"   # <-- EIP-mu
cognito_domain_prefix = "pdfholmes-prod-namaunik"      # unik global
aurora_min_acu        = 0       # auto-pause idle (hemat); prod ramai: 0.5
aurora_max_acu        = 2
allowed_app_cidr      = "172.31.0.0/16"   # CIDR default VPC (EC2 ada di sini)
vpc_id                = ""                 # kosong = default VPC
```
Cek CIDR default VPC-mu: VPC console → Your VPCs → default → IPv4 CIDR.
Biasanya `172.31.0.0/16`. Samakan.

```bash
terraform init
terraform plan
terraform apply        # ketik: yes   (Aurora ~10 menit)
```

Ambil hasil:
```bash
terraform output cognito_issuer
terraform output cognito_jwks_url
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output -raw cognito_client_secret
terraform output aurora_endpoint
aws secretsmanager get-secret-value --secret-id pdfholmes/aurora/credentials \
  --query SecretString --output text | jq -r .url      # DATABASE_URL
```
Simpan semua nilai ini.

---

## 5. Masuk EC2 + install Docker
```bash
chmod 400 pdfholmes-key.pem
ssh -i pdfholmes-key.pem ubuntu@1.2.3.4
# di dalam EC2:
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER && exec sudo su - $USER
docker version    # cek jalan
```

---

## 6. Clone repo + isi .env.prod (di EC2)
```bash
git clone <URL-REPO-MU> pdfholmes && cd pdfholmes
cp .env.prod.example .env.prod

# generate rahasia:
openssl rand -base64 32   # -> NEXTAUTH_SECRET
openssl rand -base64 48   # -> MINIO_ROOT_PASSWORD
# OPENCODE_GO_API_KEY = key langganan OpenCode Go (NON-BYOK)
nano .env.prod
```
Isi `.env.prod` (ganti `1.2.3.4` dgn EIP-mu):
```
NODE_ENV=production
DATABASE_URL=<dari secretsmanager, endpoint Aurora>
REDIS_URL=redis://redis:6379

MINIO_ROOT_USER=pdfholmes_minio
MINIO_ROOT_PASSWORD=<openssl rand 48>
MINIO_ENDPOINT=http://minio:9000
MINIO_PUBLIC_ENDPOINT=https://minio.pdfholmes.1.2.3.4.sslip.io
MINIO_CONSOLE_URL=https://console.pdfholmes.1.2.3.4.sslip.io
MINIO_REGION=ap-southeast-1

GROBID_URL=http://grobid:8070
GROBID_ENABLED=true

COGNITO_REGION=ap-southeast-1
COGNITO_USER_POOL_ID=<output>
COGNITO_CLIENT_ID=<output>
COGNITO_CLIENT_SECRET=<output -raw>
COGNITO_ISSUER=<output>
COGNITO_JWKS_URL=<output>

NEXTAUTH_URL=https://pdfholmes.1.2.3.4.sslip.io
NEXTAUTH_SECRET=<openssl rand 32>
NEXT_PUBLIC_API_URL=https://pdfholmes.1.2.3.4.sslip.io/api

API_PORT=4000
WEB_ORIGIN=https://pdfholmes.1.2.3.4.sslip.io
AUTH_DEV_BYPASS=false

EMBEDDING_DIM=1536
DEFAULT_LANGUAGE=id
ANALYZER_MOCK=false

# OpenCode Go (NON-BYOK) — penyedia AI tunggal sisi-server
OPENCODE_GO_API_KEY=<key langganan OpenCode Go>
OPENCODE_GO_MODEL=minimax-m2.7
OPENCODE_GO_PROVIDER_TYPE=anthropic
OPENCODE_GO_BASE_URL=https://opencode.ai/zen/go

BASE_DOMAIN=pdfholmes.1.2.3.4.sslip.io
ACME_EMAIL=email-mu@contoh.com
```

---

## 7. Migrasi DB + jalankan
```bash
PC="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file .env.prod"

$PC run --rm --build migrate     # harus: "Migrasi selesai."
$PC up -d --build                # build semua + jalan (pertama kali ~5-10 menit)
```

---

## 8. Cek TLS + health (tunggu ~1 menit)
```bash
$PC logs proxy | grep -i "certificate obtained"   # cert sslip.io terbit
curl https://pdfholmes.1.2.3.4.sslip.io/api/health
curl https://pdfholmes.1.2.3.4.sslip.io/api/health/ready
```

---

## 9. Login pertama
- Buka `https://pdfholmes.1.2.3.4.sslip.io` → klik Masuk → **Hosted UI Cognito**.
- **Sign up** dgn email → kode verifikasi dikirim ke email → konfirmasi.
- Masuk → upload PDF → analisis jalan.
- Portainer: `https://portainer.pdfholmes.1.2.3.4.sslip.io` → buat admin SEGERA.

---

## 10. Hidupkan AI nyata (NON-BYOK)
Set `OPENCODE_GO_API_KEY=...` di `.env.prod` (pastikan `ANALYZER_MOCK=false`), lalu
`$PC up -d api analyzer`. Pengguna tak memasukkan API key apa pun — semua memakai
langganan server. Detail: `docs/OPENCODE.md`.

---

## 11. Operasional
- Log: `$PC logs -f api analyzer extractor`
- Update: `git pull && $PC up -d --build`
- Aurora auto-pause saat idle (min ACU 0); cold start ±15s di request pertama.
- JANGAN stop EC2 sembarangan — IP tetap karena EIP, tapi Aurora cold start tiap idle.

## Biaya kasar (region SG)
t4g.large ~\$48/bln (atau t4g.medium ~\$24) + EBS ~\$2.4 + Aurora storage ~\$1-5 +
Aurora compute (auto-pause, beberapa \$) + Cognito \$0 (free tier). Kredit \$100 ~2 bln.
Hemat: pakai t4g.medium (tunda GROBID), stop EC2 saat tak dipakai.
