"""Susun konteks paper dari hasil extraction utk dikirim ke LLM per field."""
from __future__ import annotations

from . import config


def build_context(full_text: str | None, sections: dict | None,
                  metadata: dict | None) -> str:
    parts: list[str] = []

    if metadata:
        meta_lines = [f"- {k}: {v}" for k, v in metadata.items() if v]
        if meta_lines:
            parts.append("## METADATA\n" + "\n".join(meta_lines))

    # Sections terstruktur GROBID diutamakan (lebih rapi dari teks polos).
    if sections:
        sec_parts = []
        for head, body in sections.items():
            if head == "_references":
                continue
            if isinstance(body, str) and body.strip():
                sec_parts.append(f"### {head}\n{body}")
        if sec_parts:
            parts.append("## SECTIONS\n" + "\n\n".join(sec_parts))

    # Fallback / pelengkap: teks penuh.
    if full_text:
        parts.append("## TEKS PENUH\n" + full_text)

    ctx = "\n\n".join(parts)
    if len(ctx) > config.MAX_CONTEXT_CHARS:
        ctx = ctx[: config.MAX_CONTEXT_CHARS] + "\n…[dipotong]"
    return ctx
