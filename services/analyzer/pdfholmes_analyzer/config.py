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

# Codex (Fase 5).
CODEX_ENABLED = os.environ.get("CODEX_ENABLED", "false").lower() == "true"
# Device-flow login (§8.2): perintah CLI + mode mock utk uji tanpa akun ChatGPT.
CODEX_LOGIN_CMD = os.environ.get("CODEX_LOGIN_CMD", "codex login --device-code")
CODEX_DEVICE_MOCK = os.environ.get("CODEX_DEVICE_MOCK", "false").lower() == "true"
CODEX_DEFAULT_MODEL = os.environ.get("CODEX_DEFAULT_MODEL", "gpt-5.1-codex")
# Batas waktu user menyetujui device-code (detik).
CODEX_DEVICE_TIMEOUT = int(os.environ.get("CODEX_DEVICE_TIMEOUT", "300"))

# Batas panjang konteks (char) yg dikirim ke LLM per field.
MAX_CONTEXT_CHARS = int(os.environ.get("MAX_CONTEXT_CHARS", "24000"))

ANALYZER_VERSION = "analyzer-0.1.0"
