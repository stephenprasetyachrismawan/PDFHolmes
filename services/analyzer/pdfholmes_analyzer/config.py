"""Konfigurasi analyzer dari environment."""
from __future__ import annotations

import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")

QUEUE_ANALYZE = "pdfholmes:queue:analyze"
CHANNEL_STATUS = "pdfholmes:status"

# Enkripsi kredensial (§16) — harus cocok dgn apps/api CryptoService (AES-256-GCM).
CREDENTIAL_ENC_KEY = os.environ.get("CREDENTIAL_ENC_KEY", "")

EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", "1536"))
DEFAULT_LANGUAGE = os.environ.get("DEFAULT_LANGUAGE", "id")

# Mock: jalankan pipeline tanpa API key (demo end-to-end). Aktif bila true ATAU
# pengguna belum punya kredensial default.
ANALYZER_MOCK = os.environ.get("ANALYZER_MOCK", "false").lower() == "true"

# Codex (Fase 5) — stub bila nonaktif.
CODEX_ENABLED = os.environ.get("CODEX_ENABLED", "false").lower() == "true"

# Batas panjang konteks (char) yg dikirim ke LLM per field.
MAX_CONTEXT_CHARS = int(os.environ.get("MAX_CONTEXT_CHARS", "24000"))

ANALYZER_VERSION = "analyzer-0.1.0"
