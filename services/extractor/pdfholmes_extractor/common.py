"""Klien bersama: Postgres (psycopg), Redis, MinIO, publish status SSE."""
from __future__ import annotations

import json
import logging

import psycopg
import redis
from minio import Minio

from . import config

log = logging.getLogger("extractor")


def db_connect() -> psycopg.Connection:
    return psycopg.connect(config.DATABASE_URL, autocommit=False)


def redis_client() -> redis.Redis:
    return redis.Redis.from_url(config.REDIS_URL, decode_responses=True)


def minio_client() -> Minio:
    return Minio(
        config.MINIO_HOST,
        access_key=config.MINIO_ACCESS_KEY,
        secret_key=config.MINIO_SECRET_KEY,
        secure=config.MINIO_SECURE,
    )


def publish_status(r: redis.Redis, document_id: str, status: str,
                   error: str | None = None, field_key: str | None = None) -> None:
    """Publish ke channel yg dikonsumsi api (SSE -> browser)."""
    evt: dict = {"documentId": document_id, "status": status}
    if error:
        evt["error"] = error
    if field_key:
        evt["fieldKey"] = field_key
    r.publish(config.CHANNEL_STATUS, json.dumps(evt))


def set_document_status(conn: psycopg.Connection, document_id: str, status: str,
                        error: str | None = None, page_count: int | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE documents
                 SET status = %s::doc_status,
                     error = %s,
                     page_count = COALESCE(%s, page_count)
               WHERE id = %s""",
            (status, error, page_count, document_id),
        )
    conn.commit()
