#!/usr/bin/env bash
# Jalankan pgweb (UI web browse DB) tersambung ke Aurora pakai IAM auth.
# Token IAM kedaluwarsa ~15 menit → jalankan ulang script ini tiap mau pakai
# sesi baru (koneksi yang sedang jalan tetap hidup, koneksi BARU butuh token segar).
#
# Pakai:  ./scripts/db-gui.sh          # start/restart pgweb (mode read-only)
#         ./scripts/db-gui.sh --rw     # izinkan tulis (hati-hati)
#         ./scripts/db-gui.sh stop     # matikan container pgweb
#
# Akses: https://$PGWEB_DOMAIN  (basic_auth: user admin, lihat Caddyfile).
# Butuh: aws-cli, EC2 role pdfholmes-ec2. Endpoint dibaca dari .env.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "❌ .env tak ditemukan" >&2; exit 1; }

NET=pdfholmes_default
NAME=pgweb

if [ "${1:-}" = "stop" ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 && echo "pgweb dimatikan." || echo "pgweb tak jalan."
  exit 0
fi

READONLY="--readonly"
[ "${1:-}" = "--rw" ] && READONLY=""

URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
REGION=$(grep -E '^DB_IAM_REGION=' .env | head -1 | cut -d= -f2-)
REGION=${REGION:-ap-southeast-1}
proto=${URL#*://}; USER=${proto%%@*}; hostpart=${proto#*@}
HOST=${hostpart%%:*}; rest=${hostpart#*:}; PORT=${rest%%/*}; DB=${rest#*/}

echo "→ generate token IAM ($USER@$HOST)…"
TOKEN=$(aws rds generate-db-auth-token --hostname "$HOST" --port "$PORT" \
  --username "$USER" --region "$REGION")
# Token mengandung / + = & → URL-encode utk dipakai di DATABASE_URL.
ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$TOKEN")

# Aurora memakai cert CA PUBLIK Amazon (Amazon RSA 2048 M04 → Amazon Root CA 1),
# bukan CA privat RDS — jadi verifikasi pakai system CA bundle. Mode WAJIB
# verify-full: itu satu-satunya mode lib/pq (Go) yang mengirim SNI, yang
# diperlukan endpoint Aurora di belakang NLB (mode require → handshake failure).
CONN="postgres://${USER}:${ENC}@${HOST}:${PORT}/${DB}?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt"

docker rm -f "$NAME" >/dev/null 2>&1 || true
echo "→ start pgweb${READONLY:+ (read-only)}…"
docker run -d --name "$NAME" --network "$NET" --restart no \
  -e DATABASE_URL="$CONN" \
  sosedoff/pgweb:latest \
  /usr/bin/pgweb --bind=0.0.0.0 --listen=8081 $READONLY >/dev/null

PGWEB_DOMAIN=$(grep -E '^PGWEB_DOMAIN=' .env | head -1 | cut -d= -f2-)
sleep 2
echo "✅ pgweb jalan. Buka: https://${PGWEB_DOMAIN}"
echo "   (token valid ~15 mnt; jalankan script lagi utk sesi baru.)"
