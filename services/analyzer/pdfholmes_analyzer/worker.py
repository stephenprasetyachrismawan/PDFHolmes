"""Worker analyzer: konsumsi job ANALYZE, isi 48 field analysis_sections.

Alur (§6):
  BRPOP queue:analyze -> ambil extraction + kredensial AI default user
  -> per field: prompt -> LLM -> JSON tervalidasi -> simpan section (+embedding)
  -> publish status per field (streaming) -> finalize status=analyzed.
"""
from __future__ import annotations

import json
import logging
import signal
import sys

import psycopg

from . import config, context as ctxmod
from .common import db_connect, publish_status, redis_client, set_document_status
from .providers import AIProvider, FieldResult, MockProvider, OpenCodeGoProvider

# field-schema kanonik (dipasang via FIELD_SCHEMA_PATH + PYTHONPATH di Dockerfile).
from field_schema import embedding_dim, fields as schema_fields  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("analyzer")

_running = True


def _stop(*_):
    global _running
    _running = False
    log.info("sinyal berhenti diterima")


# ───────────────────────── DB helpers ─────────────────────────
def _find_or_create_analysis(conn, document_id: str, language: str,
                             provider: str | None, model: str | None) -> str:
    """Pakai analisis aktif (belum finished) bila ada (mis. dibuat api trigger),
    selain itu buat baru. Kembalikan analysis_id."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id FROM analyses
                WHERE document_id = %s AND finished_at IS NULL
                ORDER BY created_at DESC LIMIT 1""",
            (document_id,),
        )
        row = cur.fetchone()
        if row:
            cur.execute(
                """UPDATE analyses
                      SET language=%s, provider=%s::ai_provider, model=%s,
                          status='analyzing'::doc_status, started_at=now()
                    WHERE id=%s""",
                (language, provider, model, row[0]),
            )
            conn.commit()
            return str(row[0])
        cur.execute(
            """INSERT INTO analyses (document_id, language, provider, model, status, started_at)
               VALUES (%s, %s, %s::ai_provider, %s, 'analyzing'::doc_status, now())
               RETURNING id""",
            (document_id, language, provider, model),
        )
        analysis_id = cur.fetchone()[0]
    conn.commit()
    return str(analysis_id)


def _load_extraction(conn, document_id: str) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT full_text, sections, metadata FROM extractions WHERE document_id = %s",
            (document_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"full_text": row[0], "sections": row[1] or {}, "metadata": row[2] or {}}



def _load_research_interest(conn, user_id: str) -> str | None:
    with conn.cursor() as cur:
        cur.execute("SELECT research_interest FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
    return row[0] if row else None


def _save_section(conn, analysis_id: str, field, result: FieldResult,
                  embedding: list[float] | None) -> None:
    emb_str = None
    if embedding and len(embedding) == embedding_dim():
        emb_str = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO analysis_sections
                 (analysis_id, field_key, label, content_md, source, confidence,
                  order_index, embedding)
               VALUES (%s, %s, %s, %s, %s::field_source, %s, %s, %s::vector)
               ON CONFLICT (analysis_id, field_key) DO UPDATE SET
                 content_md = EXCLUDED.content_md,
                 source = EXCLUDED.source,
                 confidence = EXCLUDED.confidence,
                 embedding = EXCLUDED.embedding""",
            (
                analysis_id, field.key, field.label, result.content_md,
                result.source, result.confidence, field.order, emb_str,
            ),
        )
    conn.commit()


def _finalize(conn, analysis_id: str, document_id: str, provider_name: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE analyses SET status='analyzed'::doc_status, finished_at=now()
                WHERE id=%s""",
            (analysis_id,),
        )
    conn.commit()
    set_document_status(conn, document_id, "analyzed")


# ───────────────────────── provider selection ─────────────────────────
def _select_provider(conn, user_id: str) -> tuple[AIProvider, str | None, str | None]:
    """Kembalikan (provider, provider_name_for_db, model).

    NON-BYOK: pakai OpenCode Go (key dari env server) untuk SEMUA pengguna.
    Tak ada lagi kredensial per-user. Fallback MockProvider hanya bila
    ANALYZER_MOCK=true atau OPENCODE_GO_API_KEY belum diset.
    """
    if config.ANALYZER_MOCK or not config.OPENCODE_GO_API_KEY:
        if not config.OPENCODE_GO_API_KEY:
            log.warning("OPENCODE_GO_API_KEY kosong -> fallback MockProvider")
        return MockProvider(), None, "mock"

    provider = OpenCodeGoProvider(
        api_key=config.OPENCODE_GO_API_KEY,
        model=config.OPENCODE_GO_MODEL,
        base_url=config.OPENCODE_GO_BASE_URL,
        provider_type=config.OPENCODE_GO_PROVIDER_TYPE,
        max_tokens=config.OPENCODE_GO_MAX_TOKENS,
    )
    return provider, "opencode_go", config.OPENCODE_GO_MODEL


# ───────────────────────── main handler ─────────────────────────
def handle_analyze(conn, r, job: dict) -> None:
    document_id = job["documentId"]
    user_id = job["userId"]
    language = job.get("language") or config.DEFAULT_LANGUAGE
    log.info("ANALYZE mulai doc=%s lang=%s", document_id, language)

    extraction = _load_extraction(conn, document_id)
    if not extraction:
        raise RuntimeError("extraction belum ada untuk dokumen ini")

    provider, provider_name, model = _select_provider(conn, user_id)
    analysis_id = _find_or_create_analysis(conn, document_id, language, provider_name, model)

    base_context = ctxmod.build_context(
        extraction["full_text"], extraction["sections"], extraction["metadata"]
    )
    research_interest = _load_research_interest(conn, user_id)

    publish_status(r, document_id, "analyzing")

    # Per-field (§6): prompt -> LLM -> JSON -> simpan -> stream status.
    for field in schema_fields():
        prompt = field.prompt
        ctx = base_context
        # Field relevansi pengguna: sertakan minat riset bila ada.
        if field.key == "relevansi_pengguna" and research_interest:
            ctx = f"MINAT RISET PENGGUNA: {research_interest}\n\n{ctx}"

        try:
            result = provider.analyze_field(
                field.key, prompt, ctx, language, field.default_source
            )
        except Exception as exc:  # noqa: BLE001 — satu field gagal jangan gagalkan semua
            log.warning("field %s gagal: %s", field.key, exc)
            result = FieldResult(
                content_md=f"_Gagal menganalisis field ini: {str(exc)[:200]}_",
                source=field.default_source,
            )

        embedding = None
        if result.content_md:
            try:
                embedding = provider.embed(result.content_md)
            except Exception as exc:  # noqa: BLE001
                log.debug("embed %s gagal: %s", field.key, exc)

        _save_section(conn, analysis_id, field, result, embedding)
        publish_status(r, document_id, "analyzing", field_key=field.key)

    _finalize(conn, analysis_id, document_id, provider.name)
    publish_status(r, document_id, "analyzed")
    log.info("ANALYZE selesai doc=%s (%d field)", document_id, len(schema_fields()))


def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    r = redis_client()
    conn = db_connect()
    log.info("analyzer siap, menunggu job di %s (mock=%s)",
             config.QUEUE_ANALYZE, config.ANALYZER_MOCK)

    while _running:
        item = r.brpop(config.QUEUE_ANALYZE, timeout=5)
        if item is None:
            continue
        _, raw = item
        try:
            if conn.closed:
                conn = db_connect()
            handle_analyze(conn, r, json.loads(raw))
        except Exception as exc:  # noqa: BLE001
            log.exception("job analyze gagal: %s", exc)
            try:
                doc_id = json.loads(raw).get("documentId")
                if doc_id:
                    if conn.closed:
                        conn = db_connect()
                    set_document_status(conn, doc_id, "failed", error=str(exc)[:500])
                    publish_status(r, doc_id, "failed", error=str(exc)[:500])
            except Exception:
                log.exception("gagal menandai failed")

    conn.close()
    log.info("analyzer berhenti")


if __name__ == "__main__":
    sys.exit(main())
