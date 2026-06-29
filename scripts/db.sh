#!/usr/bin/env bash
# Buka psql ke Aurora PostgreSQL pakai IAM auth (token regen tiap panggil).
# Pakai:
#   ./scripts/db.sh                 # psql interaktif
#   ./scripts/db.sh "SELECT ..."    # jalankan 1 query lalu keluar
#   ./scripts/db.sh -f file.sql     # jalankan file SQL
# Butuh: aws-cli + psql di host, EC2 role pdfholmes-ec2 (managed policy
# pdfholmes-rds-connect). Endpoint/region dibaca dari .env (DATABASE_URL,
# DB_IAM_REGION). Aurora WAJIB sslmode=require.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "❌ .env tak ditemukan" >&2; exit 1; }

URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
REGION=$(grep -E '^DB_IAM_REGION=' .env | head -1 | cut -d= -f2-)
REGION=${REGION:-ap-southeast-1}

# Parse postgres://user@host:port/db (tanpa password)
proto=${URL#*://}
USER=${proto%%@*}
hostpart=${proto#*@}
HOST=${hostpart%%:*}
rest=${hostpart#*:}
PORT=${rest%%/*}
DB=${rest#*/}

TOKEN=$(aws rds generate-db-auth-token --hostname "$HOST" --port "$PORT" \
  --username "$USER" --region "$REGION")

exec env PGPASSWORD="$TOKEN" psql \
  "host=$HOST port=$PORT user=$USER dbname=$DB sslmode=require" "$@"
