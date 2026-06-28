"""Konfigurasi analyzer dari environment."""
from __future__ import annotations

import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
# IAM auth ke RDS/Aurora (cluster free/express yg memaksa IAM). Bila true, password
# di DATABASE_URL diabaikan; token IAM 15-menit dibuat per koneksi + SSL wajib.
DB_IAM_AUTH = os.environ.get("DB_IAM_AUTH", "false").lower() == "true"
DB_IAM_REGION = (
    os.environ.get("DB_IAM_REGION")
    or os.environ.get("AWS_REGION")
    or os.environ.get("COGNITO_REGION")
    or "ap-southeast-1"
)
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")

QUEUE_ANALYZE = "pdfholmes:queue:analyze"
CHANNEL_STATUS = "pdfholmes:status"

EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", "1536"))
DEFAULT_LANGUAGE = os.environ.get("DEFAULT_LANGUAGE", "id")

# Mock: jalankan pipeline tanpa API key (demo end-to-end). Aktif bila true ATAU
# tak ada OpenCode Go key di server.
ANALYZER_MOCK = os.environ.get("ANALYZER_MOCK", "false").lower() == "true"

# ── OpenCode Go (penyedia AI tunggal sisi-server, NON-BYOK) ──
# Key HANYA dari env server; tak pernah per-user, tak pernah dari browser.
OPENCODE_GO_API_KEY = os.environ.get("OPENCODE_GO_API_KEY", "")
OPENCODE_GO_MODEL = os.environ.get("OPENCODE_GO_MODEL", "minimax-m2.7")
OPENCODE_GO_PROVIDER_TYPE = os.environ.get("OPENCODE_GO_PROVIDER_TYPE", "anthropic")
OPENCODE_GO_BASE_URL = os.environ.get("OPENCODE_GO_BASE_URL", "https://opencode.ai/zen/go")
OPENCODE_GO_MAX_TOKENS = int(os.environ.get("OPENCODE_GO_MAX_TOKENS", "2000"))
# Mode BATCH: 1 panggilan utk SEMUA field (48) -> butuh output besar.
OPENCODE_GO_BATCH_MAX_TOKENS = int(os.environ.get("OPENCODE_GO_BATCH_MAX_TOKENS", "8000"))

# Batas panjang konteks (char) yg dikirim ke LLM per field.
MAX_CONTEXT_CHARS = int(os.environ.get("MAX_CONTEXT_CHARS", "24000"))

# Jumlah field yg dianalisis paralel (48 panggilan LLM jadi N-paralel, bukan
# berurutan). Mempercepat analisis dramatis. Naikkan hati-hati: dibatasi rate
# limit penyedia. httpx.Client thread-safe; penyimpanan DB tetap di main thread.
ANALYZE_CONCURRENCY = int(os.environ.get("ANALYZE_CONCURRENCY", "8"))

ANALYZER_VERSION = "analyzer-0.1.0"
