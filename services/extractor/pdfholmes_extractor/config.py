"""Konfigurasi extractor dari environment."""
from __future__ import annotations

import os
from urllib.parse import urlparse

DATABASE_URL = os.environ.get("DATABASE_URL", "")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
GROBID_URL = os.environ.get("GROBID_URL", "http://grobid:8070")

_minio = urlparse(os.environ.get("MINIO_ENDPOINT", "http://minio:9000"))
MINIO_HOST = f"{_minio.hostname}:{_minio.port or (443 if _minio.scheme == 'https' else 80)}"
MINIO_SECURE = _minio.scheme == "https"
MINIO_ACCESS_KEY = os.environ.get("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")

# Harus identik dgn packages/shared-types/src/index.ts
QUEUE_EXTRACT = "pdfholmes:queue:extract"
QUEUE_ANALYZE = "pdfholmes:queue:analyze"
CHANNEL_STATUS = "pdfholmes:status"

EXTRACTOR_VERSION = "extractor-0.1.0"
GROBID_ENABLED = os.environ.get("GROBID_ENABLED", "true").lower() == "true"
