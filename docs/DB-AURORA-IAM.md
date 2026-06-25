# PDFHo!mes — Aurora dengan IAM Database Authentication

Untuk Aurora **free / express plan** yang **memaksa IAM auth** (punya *Internet
Access Gateway* yang tak bisa dimatikan). Gejala:
```
FATAL: PAM authentication failed for user "app"
```
Password statis tak bisa dipakai → app harus mint **token IAM 15-menit** tiap
koneksi. Kode sudah mendukung ini: set `DB_IAM_AUTH=true`.

Tiga syarat wajib (semua harus ada):
1. DB user punya role `rds_iam`.
2. IAM identity (role EC2) punya izin `rds-db:connect`.
3. App di-set `DB_IAM_AUTH=true`.

---

## 1. DB: beri role `rds_iam` ke user app

Konek sebagai master via token (master `postgres` sudah punya rds_iam dari express
config):
```bash
ENDPOINT=<writer-endpoint>     # database-1.cluster-xxxx.<region>.rds.amazonaws.com
TOKEN=$(aws rds generate-db-auth-token --hostname "$ENDPOINT" --port 5432 \
  --username postgres --region ap-southeast-1)
PGPASSWORD="$TOKEN" psql "host=$ENDPOINT port=5432 dbname=pdfholmes user=postgres sslmode=require"
```
Di prompt:
```sql
GRANT rds_iam TO app;
```
Tanpa ini, token untuk `app` ditolak (`PAM authentication failed`).

> Catatan: dgn `rds_iam`, user `app` **hanya** bisa login via token IAM — password
> tak lagi berlaku untuknya. Itu memang yang dipakai app.

---

## 2. IAM: role EC2 boleh `rds-db:connect`

App jalan di container di EC2. boto3 / aws-sdk ambil kredensial dari **IAM role
instance EC2** (via metadata) — cara paling aman (tanpa simpan access key).

### a. Ambil DbiResourceId cluster
```bash
aws rds describe-db-clusters --db-cluster-identifier database-1 \
  --region ap-southeast-1 --query "DBClusters[0].DbClusterResourceId" --output text
# contoh: cluster-JIMBEQIZTG7T2WA2WJFKZFV4HY
```

### b. Buat policy (ganti ACCOUNT_ID, region, resource-id, db user)
`rds-iam-connect.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "rds-db:connect",
    "Resource": "arn:aws:rds-db:ap-southeast-1:ACCOUNT_ID:dbuser:cluster-JIMBEQIZTG7T2WA2WJFKZFV4HY/app"
  }]
}
```
> `app` di akhir ARN = nama DB user. Tambah statement kedua utk `postgres` bila
> migrate dijalankan sbg postgres (lihat catatan §4).

```bash
aws iam create-policy --policy-name pdfholmes-rds-connect \
  --policy-document file://rds-iam-connect.json
```

### c. Buat role EC2 + attach + pasang ke instance
```bash
# trust policy utk EC2
cat > ec2-trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF

aws iam create-role --role-name pdfholmes-ec2 \
  --assume-role-policy-document file://ec2-trust.json
aws iam attach-role-policy --role-name pdfholmes-ec2 \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/pdfholmes-rds-connect
aws iam create-instance-profile --instance-profile-name pdfholmes-ec2
aws iam add-role-to-instance-profile --instance-profile-name pdfholmes-ec2 \
  --role-name pdfholmes-ec2

# pasang ke instance EC2 (ambil instance-id dari console / aws ec2 describe-instances)
aws ec2 associate-iam-instance-profile --instance-id i-xxxxxxxx \
  --iam-instance-profile Name=pdfholmes-ec2 --region ap-southeast-1
```

Atau lewat Console: EC2 → instance → Actions → Security → **Modify IAM role** →
pilih `pdfholmes-ec2`.

---

## 3. App: aktifkan IAM mode

`.env.prod`:
```env
DATABASE_URL=postgres://app:ignored@<writer-endpoint>:5432/pdfholmes?sslmode=require
DB_IAM_AUTH=true
DB_IAM_REGION=ap-southeast-1
```
- Password di `DATABASE_URL` **diabaikan** saat `DB_IAM_AUTH=true` (boleh isi apa
  saja); yang dipakai token IAM. User & host tetap dibaca dari URL.
- `sslmode=require` wajib (IAM auth selalu TLS).

Jalankan **tanpa** override localdb (pakai Aurora):
```bash
PC="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file .env.prod"
$PC run --rm --build migrate
$PC up -d --build
```

---

## 4. Migrate sebagai user mana?

`migrate` butuh buat extension (`vector`, `pgcrypto`) — biasanya butuh master.
Dua pilihan:

- **A (disarankan)**: buat extension sekali manual sbg `postgres` (sudah dilakukan
  saat setup DB), lalu `migrate` jalan sbg `app` (DDL tabel cukup). `DATABASE_URL`
  pakai user `app`. Policy `rds-db:connect` cukup utk `app`.
- **B**: `migrate` jalan sbg `postgres`. Maka tambah ARN `.../postgres` di policy,
  dan set `DATABASE_URL` migrate ke user `postgres`. Lebih luas hak → kurang aman.

Default repo: satu `DATABASE_URL` utk semua → pakai **A**.

---

## 5. Verifikasi

```bash
$PC logs migrate          # "Migrasi selesai."
$PC logs api | tail        # tak ada error koneksi DB
curl https://<host>/api/health/ready   # db ok
```

Gagal `PAM authentication failed` saat app jalan →
- `GRANT rds_iam TO app;` belum dijalankan, atau
- IAM role EC2 belum punya `rds-db:connect` utk user `app`, atau
- ARN resource-id / region / db user di policy salah.

Gagal `NoCredentialsError` (Python) / `Could not load credentials` (Node) →
IAM role belum nempel ke instance EC2 (atau metadata diblok).
