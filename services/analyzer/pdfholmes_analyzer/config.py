"""Konfigurasi analyzer dari environment."""
from __future__ import annotations

import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
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

# Batas panjang konteks (char) yg dikirim ke LLM per field.
MAX_CONTEXT_CHARS = int(os.environ.get("MAX_CONTEXT_CHARS", "24000"))

ANALYZER_VERSION = "analyzer-0.1.0"
