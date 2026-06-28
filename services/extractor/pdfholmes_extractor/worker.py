"""Worker extractor: konsumsi job EXTRACT, hasilkan extractions, chain ke ANALYZE.

Alur (§6):
  BRPOP queue:extract -> GET PDF (MinIO) -> PyMuPDF + GROBID -> simpan extractions
  -> status=extracted -> enqueue ANALYZE(doc, lang) -> status=analyzing
"""
from __future__ import annotations

import io
import json
import logging
import signal
import sys

import psycopg

from . import config, grobid
from .common import (
    db_connect,
    minio_client,
    publish_status,
    redis_client,
    set_document_status,
)
from .pdf import extract_pdf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("extractor")

_running = True


def _stop(*_):
    global _running
    _running = False
    log.info("sinyal berhenti diterima, keluar setelah job aktif selesai")


def _load_document(conn: psycopg.Connection, document_id: str) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT d.id, d.object_key, d.user_id,
                      u.minio_bucket, u.preferred_language
                 FROM documents d JOIN users u ON u.id = d.user_id
                WHERE d.id = %s""",
            (document_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "object_key": row[1],
        "user_id": str(row[2]),
        "bucket": row[3],
        "language": row[4],
    }


def _strip_nul(value):
    """Buang NUL (0x00) dari semua string. Postgres text & jsonb menolak \\u0000;
    PDF kadang menghasilkannya, bikin INSERT gagal ('cannot contain NUL bytes')."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, dict):
        return {k: _strip_nul(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_strip_nul(v) for v in value]
    return value


def _save_extraction(conn: psycopg.Connection, document_id: str, *,
                     full_text: str, tei_xml: str | None,
                     sections: dict, metadata: dict) -> None:
    full_text = _strip_nul(full_text)
    tei_xml = _strip_nul(tei_xml)
    sections = _strip_nul(sections)
    metadata = _strip_nul(metadata)
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO extractions
                 (document_id, full_text, tei_xml, sections, metadata, extractor_version)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (document_id) DO UPDATE SET
                 full_text = EXCLUDED.full_text,
                 tei_xml = EXCLUDED.tei_xml,
                 sections = EXCLUDED.sections,
                 metadata = EXCLUDED.metadata,
                 extractor_version = EXCLUDED.extractor_version""",
            (
                document_id,
                full_text,
                tei_xml,
                json.dumps(sections),
                json.dumps(metadata),
                config.EXTRACTOR_VERSION,
            ),
        )
    conn.commit()


def handle_extract(conn, mc, r, job: dict) -> None:
    document_id = job["documentId"]
    log.info("EXTRACT mulai doc=%s", document_id)

    doc = _load_document(conn, document_id)
    if not doc:
        log.warning("dokumen %s tidak ada, skip", document_id)
        return

    publish_status(r, document_id, "extracting")

    # 1. Ambil PDF dari MinIO.
    resp = mc.get_object(doc["bucket"], doc["object_key"])
    try:
        pdf_bytes = resp.read()
    finally:
        resp.close()
        resp.release_conn()

    # 2. PyMuPDF — teks + metadata + page_count.
    pdf = extract_pdf(pdf_bytes)

    # 3. GROBID — TEI XML terstruktur (best-effort).
    tei_xml = grobid.process_fulltext(pdf_bytes)
    sections: dict = {}
    grobid_meta: dict = {}
    if tei_xml:
        grobid_meta, sections = grobid.parse_tei(tei_xml)

    # Gabung metadata: GROBID diutamakan, fallback PyMuPDF.
    metadata = {**pdf.metadata, **{k: v for k, v in grobid_meta.items() if v}}

    # 4. Simpan extractions + update dokumen.
    _save_extraction(
        conn, document_id,
        full_text=pdf.full_text, tei_xml=tei_xml,
        sections=sections, metadata=metadata,
    )
    set_document_status(conn, document_id, "extracted", page_count=pdf.page_count)
    publish_status(r, document_id, "extracted")

    # 5. Chain ke analisis (§6): enqueue ANALYZE + status analyzing.
    analyze_job = {
        "type": "ANALYZE",
        "documentId": document_id,
        "userId": doc["user_id"],
        "language": doc["language"],
    }
    r.lpush(config.QUEUE_ANALYZE, json.dumps(analyze_job))
    set_document_status(conn, document_id, "analyzing")
    publish_status(r, document_id, "analyzing")
    log.info("EXTRACT selesai doc=%s -> ANALYZE enqueued", document_id)


def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    r = redis_client()
    mc = minio_client()
    conn = db_connect()
    log.info("extractor siap, menunggu job di %s", config.QUEUE_EXTRACT)

    while _running:
        item = r.brpop(config.QUEUE_EXTRACT, timeout=5)
        if item is None:
            continue
        _, raw = item
        try:
            job = json.loads(raw)
            handle_extract(conn, mc, r, job)
        except Exception as exc:  # noqa: BLE001 — worker tahan-gagal
            log.exception("job gagal: %s", exc)
            doc_id = None
            try:
                doc_id = json.loads(raw).get("documentId")
            except Exception:
                pass
            if doc_id:
                try:
                    if conn.closed:
                        conn = db_connect()
                    set_document_status(conn, doc_id, "failed", error=str(exc)[:500])
                    publish_status(r, doc_id, "failed", error=str(exc)[:500])
                except Exception:
                    log.exception("gagal menandai failed")

    conn.close()
    log.info("extractor berhenti")


if __name__ == "__main__":
    sys.exit(main())
