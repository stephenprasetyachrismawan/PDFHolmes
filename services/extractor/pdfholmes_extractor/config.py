"""Konfigurasi extractor dari environment."""
from __future__ import annotations

import os
from urllib.parse import urlparse

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
