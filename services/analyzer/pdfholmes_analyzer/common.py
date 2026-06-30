"""Klien bersama: Postgres, Redis, publish status."""
from __future__ import annotations

import json
import logging

import psycopg
import redis

from . import config

log = logging.getLogger("analyzer")


def db_connect() -> psycopg.Connection:
    if not config.DB_IAM_AUTH:
        return psycopg.connect(config.DATABASE_URL, autocommit=False)
    # IAM auth: token 15-menit sbg password (dibuat per koneksi) + SSL wajib.
    import boto3
    from urllib.parse import unquote, urlparse

    u = urlparse(config.DATABASE_URL)
    host = u.hostname or ""
    port = u.port or 5432
    user = unquote(u.username or "")
    dbname = (u.path or "/").lstrip("/")
    token = boto3.client("rds", region_name=config.DB_IAM_REGION).generate_db_auth_token(
        DBHostname=host, Port=port, DBUsername=user, Region=config.DB_IAM_REGION
    )
    return psycopg.connect(
        host=host, port=port, user=user, dbname=dbname,
        password=token, sslmode="require", autocommit=False,
    )


def redis_client() -> redis.Redis:
    return redis.Redis.from_url(config.REDIS_URL, decode_responses=True)


def publish_status(r: redis.Redis, document_id: str, status: str,
                   error: str | None = None, field_key: str | None = None,
                   message: str | None = None) -> None:
    evt: dict = {"documentId": document_id, "status": status}
    if error:
        evt["error"] = error
    if field_key:
        evt["fieldKey"] = field_key
    # Baris log untuk panel pemrosesan di browser (mis. respons mentah AI).
    if message:
        evt["message"] = message
    r.publish(config.CHANNEL_STATUS, json.dumps(evt))


def set_document_status(conn: psycopg.Connection, document_id: str, status: str,
                        error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET status = %s::doc_status, error = %s WHERE id = %s",
            (status, error, document_id),
        )
    conn.commit()
