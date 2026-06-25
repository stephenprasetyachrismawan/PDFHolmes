# AWS Cognito — Konfigurasi Lengkap (dari Nol)

Panduan ini menyiapkan login Amazon Cognito untuk PDFHo!mes dari awal sampai
bisa login. Tersedia **dua jalur**: (A) **Terraform** (disarankan, otomatis) dan
(B) **AWS Console** (manual, untuk memahami tiap bagian). Di akhir ada cara
menghubungkan output ke `.env`, alur token, dan troubleshooting.

> Tanpa AWS? Untuk dev cepat, set `AUTH_DEV_BYPASS=true` di `.env` → app memakai
> header `x-dev-user` (email) tanpa Cognito. **Dilarang di produksi** (api menolak
> boot bila `AUTH_DEV_BYPASS=true` saat `NODE_ENV=production`).

---

## Bagaimana app memakai Cognito

```
Browser ──(1) login──▶ Cognito Hosted UI ──(2) code──▶ web (Auth.js)
   ▲                                                      │
   │                                          (3) tukar code→token (PKCE)
   │                                                      ▼
   └──────────── sesi (id_token disimpan) ◀───────────────┘
                         │
                         │ (4) panggil API: Authorization: Bearer <id_token>
                         ▼
                       api (NestJS) ──(5) verifikasi tanda tangan via JWKS──▶ Cognito
```

- `web` (Next.js + Auth.js v5) memakai **Authorization Code + PKCE** ke Hosted UI.
- `web` menyimpan `id_token` di sesi dan mengirimnya sebagai **Bearer** ke `api`.
- `api` memverifikasi JWT memakai **JWKS** publik Cognito (`COGNITO_JWKS_URL`),
  mencocokkan `issuer` (`COGNITO_ISSUER`) dan `aud` (`COGNITO_CLIENT_ID`).
- Saat login pertama, `api` membuat baris `users` (sinkron dari klaim Cognito) dan
  membuat bucket MinIO per-user.

Env yang dibutuhkan (sumber kebenaran: output Terraform di bawah):

| Env | Dipakai oleh | Contoh |
|---|---|---|
| `COGNITO_REGION` | api | `ap-southeast-1` |
| `COGNITO_USER_POOL_ID` | (info) | `ap-southeast-1_abc123` |
| `COGNITO_CLIENT_ID` | web + api | `1h57k...` |
| `COGNITO_CLIENT_SECRET` | web | `xxxxx` |
| `COGNITO_ISSUER` | web + api | `https://cognito-idp.<region>.amazonaws.com/<poolId>` |
| `COGNITO_JWKS_URL` | api | `<issuer>/.well-known/jwks.json` |

---

## Jalur A — Terraform (disarankan)

Sudah tersedia di `infra/aws/` (`cognito.tf`, `outputs.tf`, `variables.tf`).

### A.1 Prasyarat

```bash
aws configure                 # kredensial IAM dgn izin Cognito + RDS + Secrets
aws sts get-caller-identity   # pastikan identitas benar
terraform -version            # >= 1.5
```

### A.2 Isi variabel

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars
```

Isi minimal:

```hcl
region                = "ap-southeast-1"
project               = "pdfholmes"
domain                = "pdfholmes.example.com"   # domain web publik (untuk callback)
cognito_domain_prefix = "pdfholmes-auth"          # subdomain Hosted UI (harus unik global)
```

> `domain` menentukan callback `https://<domain>/api/auth/callback/cognito` dan
> logout `https://<domain>`. Tanpa domain (jalur sslip.io), pakai
> `pdfholmes.<ElasticIP>.sslip.io` sebagai `domain`.

### A.3 Apply

```bash
terraform init
terraform apply        # buat User Pool + Hosted UI domain + App client
```

### A.4 Ambil output → `.env.prod`

```bash
terraform output cognito_issuer
terraform output cognito_jwks_url
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output -raw cognito_client_secret   # rahasia
terraform output cognito_hosted_ui_domain
```

Salin ke `.env.prod` (lihat bagian "Hubungkan ke `.env`").

---

## Jalur B — AWS Console (manual)

### B.1 Buat User Pool

1. Console → **Cognito** → **User pools** → **Create user pool**.
2. **Sign-in options**: centang **Email**.
3. **Password policy**: minimal 8, butuh huruf besar/kecil/angka (samakan dgn tim).
4. **MFA**: *Optional* (TOTP) — boleh *No MFA* untuk awal.
5. **Self-service sign-up**: **Enabled** (agar pengguna bisa daftar sendiri).
6. **Attribute verification**: verifikasi **email** (kirim kode).
7. **Email provider**: *Send email with Cognito* (cukup untuk awal; produksi besar
   pakai SES).
8. **User pool name**: `pdfholmes-users` → **Create**.
9. Catat **User pool ID** (mis. `ap-southeast-1_abc123`).

### B.2 Hosted UI domain

1. Di user pool → tab **App integration** → **Domain** → **Create Cognito domain**.
2. Isi prefix unik, mis. `pdfholmes-auth` → simpan.
3. Domain Hosted UI jadi:
   `https://pdfholmes-auth.auth.<region>.amazoncognito.com`.

### B.3 App client

1. **App integration** → **App clients** → **Create app client**.
2. Tipe: **Confidential client** (punya secret — Auth.js mendukung).
3. **App client name**: `pdfholmes-web`. Centang **Generate a client secret**.
4. **Hosted UI / OAuth**:
   - **Allowed callback URLs**: `https://<domain>/api/auth/callback/cognito`
   - **Allowed sign-out URLs**: `https://<domain>`
   - **OAuth grant types**: **Authorization code grant**.
   - **OpenID Connect scopes**: `openid`, `email`, `profile`.
   - **Identity providers**: **Cognito user pool**.
5. **Auth flows**: aktifkan `ALLOW_USER_SRP_AUTH` dan `ALLOW_REFRESH_TOKEN_AUTH`.
6. **Create**. Catat **Client ID** dan **Client secret**.

> Dev lokal: tambahkan juga callback `http://localhost:3000/api/auth/callback/cognito`
> dan sign-out `http://localhost:3000` agar bisa login dari mesin lokal.

### B.4 Susun nilai env

- `COGNITO_REGION` = region pool (mis. `ap-southeast-1`).
- `COGNITO_USER_POOL_ID` = dari B.1.
- `COGNITO_CLIENT_ID` / `COGNITO_CLIENT_SECRET` = dari B.3.
- `COGNITO_ISSUER` = `https://cognito-idp.<region>.amazonaws.com/<poolId>`.
- `COGNITO_JWKS_URL` = `<issuer>/.well-known/jwks.json`.

---

## Hubungkan ke `.env`

`.env.prod` (produksi) atau `.env` (dev):

```bash
COGNITO_REGION=ap-southeast-1
COGNITO_USER_POOL_ID=ap-southeast-1_abc123
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_ISSUER=https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_abc123
COGNITO_JWKS_URL=https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_abc123/.well-known/jwks.json

# web (Auth.js)
NEXTAUTH_URL=https://pdfholmes.example.com
NEXTAUTH_SECRET=$(openssl rand -base64 32)
AUTH_DEV_BYPASS=false
```

Restart `web` + `api` setelah mengubah env.

---

## Verifikasi login

1. Buka `https://<domain>` → klik **Masuk** → diarahkan ke Hosted UI Cognito.
2. **Sign up** dengan email → masukkan kode verifikasi → login.
3. Setelah kembali ke app, `web` punya sesi; `api` membuat baris `users` +
   bucket MinIO saat panggilan pertama.
4. Cek cepat:
   ```bash
   curl https://<domain>/api/health      # {"status":"ok"}
   ```

---

## Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `redirect_mismatch` di Hosted UI | callback URL tak terdaftar | tambahkan `https://<domain>/api/auth/callback/cognito` persis (skema + host) |
| Login sukses, API balas `401` | `aud`/`issuer` tak cocok | pastikan `COGNITO_CLIENT_ID` & `COGNITO_ISSUER` di `api` sama dgn pool |
| `api` tolak semua token | JWKS salah | cek `COGNITO_JWKS_URL` = `<issuer>/.well-known/jwks.json` |
| Auth.js error `client_secret` | client tanpa secret / salah | App client harus *confidential* + `COGNITO_CLIENT_SECRET` benar |
| Tak bisa daftar | self sign-up nonaktif | aktifkan self-service sign-up di user pool |
| Email verifikasi tak masuk | batas email Cognito | pakai SES untuk volume tinggi |

> `api` memverifikasi `id_token` (punya `email` + `aud` = client id). Auth.js
> menyimpan `id_token` ke sesi dan mengirimkannya sebagai Bearer (lihat
> `apps/web/src/auth.ts`).
