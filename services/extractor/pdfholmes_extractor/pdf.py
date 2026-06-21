"""Ekstraksi teks/metadata PDF dgn PyMuPDF (fitz)."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

import fitz  # PyMuPDF


@dataclass
class PdfExtract:
    full_text: str
    page_count: int
    content_hash: str
    metadata: dict = field(default_factory=dict)


def extract_pdf(data: bytes) -> PdfExtract:
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        pages = [doc.load_page(i).get_text("text") for i in range(doc.page_count)]
        full_text = "\n\n".join(pages)
        meta = doc.metadata or {}
        metadata = {
            "title": (meta.get("title") or "").strip() or None,
            "author": (meta.get("author") or "").strip() or None,
            "subject": (meta.get("subject") or "").strip() or None,
            "keywords": (meta.get("keywords") or "").strip() or None,
        }
        return PdfExtract(
            full_text=full_text,
            page_count=doc.page_count,
            content_hash=hashlib.sha256(data).hexdigest(),
            metadata=metadata,
        )
    finally:
        doc.close()
