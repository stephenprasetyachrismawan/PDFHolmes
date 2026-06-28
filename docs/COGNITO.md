# Login dengan Amazon Cognito

PDFHo!mes memakai Amazon Cognito untuk login. Halaman login (Hosted UI) dihosting
AWS; setelah berhasil, `web` memegang sesi dan `api` memverifikasi tiap permintaan.

```
Browser ──(1) login──▶ Cognito Hosted UI ──(2) code──▶ web (Auth.js)
   ▲                                                      │
   │                                          (3) tukar code→token (PKCE)
   │                                                      ▼
   └──────────── sesi (id_token disimpan) ◀───────────────┘
                         │
                         │ (4) panggil API: Authorization: Bearer <id_token>
                         ▼
                       api (NestJS) ──(5) verifikasi via JWKS──▶ Cognito
```

- `web` (Next.js + Auth.js v5) memakai **Authorization Code + PKCE** ke Hosted UI,
  lalu menyimpan `id_token` di sesi dan mengirimnya sebagai **Bearer** ke `api`.
- `api` memverifikasi JWT lewat **JWKS** publik Cognito, mencocokkan `issuer` dan
  `aud` (= `COGNITO_CLIENT_ID`). Token yang audiensnya beda akan ditolak.
- Saat login pertama, `api` membuat baris `users` dari klaim Cognito dan menyiapkan
  bucket MinIO per pengguna.

---

## Provisioning (Terraform)

User Pool, Hosted UI domain, dan App client disiapkan oleh Terraform di
`infra/aws/`. Untuk deployment ini semuanya sudah dibuat; jalankan lagi hanya kalau
Anda membangun dari nol atau mengubah konfigurasi.

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars   # isi domain, prefix, region
terraform init
terraform apply
```

`terraform.tfvars` minimal:

```hcl
region                = "ap-southeast-1"
project               = "pdfholmes"
domain                = "pdfholmes.stevewithcode.net"   # domain web publik
cognito_domain_prefix = "pdfholmes-stevewithcode"       # subdomain Hosted UI (unik global)
```

> `domain` menentukan callback `https://<domain>/api/auth/callback/cognito` dan
> URL logout `https://<domain>`. App client hanya menerima callback yang persis
> terdaftar — kalau domain web berubah, perbarui `domain` lalu `terraform apply`.

---

## Hubungkan output ke `.env`

```bash
terraform output cognito_issuer
terraform output cognito_jwks_url
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output -raw cognito_client_secret   # rahasia
```

Petakan ke `.env`:

| Env | Dipakai oleh |
|---|---|
| `COGNITO_REGION` | api |
| `COGNITO_USER_POOL_ID` | (info) |
| `COGNITO_CLIENT_ID` | web + api |
| `COGNITO_CLIENT_SECRET` | web |
| `COGNITO_ISSUER` | web + api |
| `COGNITO_JWKS_URL` | api |

Plus konfigurasi web Auth.js:

```bash
NEXTAUTH_URL=https://pdfholmes.stevewithcode.net
NEXTAUTH_SECRET=<openssl rand -base64 32>
AUTH_DEV_BYPASS=false
```

Restart `web` + `api` setelah mengubah env.

---

## Mengelola pengguna

Buat pengguna lewat AWS CLI (Cognito mengirim password sementara ke email):

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <COGNITO_USER_POOL_ID> --region <COGNITO_REGION> \
  --username pengguna@contoh.com \
  --user-attributes Name=email,Value=pengguna@contoh.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL
```

Self-service sign-up juga aktif: pengguna bisa mendaftar sendiri lewat Hosted UI.

---

## Verifikasi login

1. Buka `https://pdfholmes.stevewithcode.net` → **Masuk** → diarahkan ke Hosted UI.
2. Login (atau daftar + verifikasi email).
3. Kembali ke app dengan sesi aktif; `api` membuat baris `users` + bucket MinIO saat
   panggilan pertama.

```bash
curl https://pdfholmes.stevewithcode.net/api/auth/providers   # menampilkan provider cognito
```

---

## Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `redirect_mismatch` di Hosted UI | callback URL tak terdaftar | daftarkan `https://<domain>/api/auth/callback/cognito` persis (skema + host) |
| Login sukses, API balas `401` | `aud`/`issuer` tak cocok | pastikan `COGNITO_CLIENT_ID` & `COGNITO_ISSUER` di `api` sama dengan pool |
| `api` tolak semua token | JWKS salah | cek `COGNITO_JWKS_URL` = `<issuer>/.well-known/jwks.json` |
| Auth.js error `client_secret` | secret salah/kosong | App client harus *confidential* + `COGNITO_CLIENT_SECRET` benar |
| Callback OAuth nyasar ke NestJS | proxy salah route | Caddy harus mengarahkan `/api/auth/*` ke `web`, bukan `api` |
| Email verifikasi tak masuk | batas email Cognito | pakai SES untuk volume tinggi |

> `api` memverifikasi `id_token` (punya `email` + `aud` = client id). Auth.js
> menyimpan `id_token` ke sesi dan mengirimnya sebagai Bearer (lihat
> `apps/web/src/auth.ts`).
