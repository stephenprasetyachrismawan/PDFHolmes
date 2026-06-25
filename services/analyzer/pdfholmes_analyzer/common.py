"""Klien bersama: Postgres, Redis, publish status."""
from __future__ import annotations

import json
import logging

import psycopg
import redis

from . import config

log = logging.getLogger("analyzer")


def db_connect() -> psycopg.Connection:
    return psycopg.connect(config.DATABASE_URL, autocommit=False)


def redis_client() -> redis.Redis:
    return redis.Redis.from_url(config.REDIS_URL, decode_responses=True)


def publish_status(r: redis.Redis, document_id: str, status: str,
                   error: str | None = None, field_key: str | None = None) -> None:
    evt: dict = {"documentId": document_id, "status": status}
    if error:
        evt["error"] = error
    if field_key:
        evt["fieldKey"] = field_key
    r.publish(config.CHANNEL_STATUS, json.dumps(evt))


def set_document_status(conn: psycopg.Connection, document_id: str, status: str,
                        error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET status = %s::doc_status, error = %s WHERE id = %s",
            (status, error, document_id),
        )
    conn.commit()
