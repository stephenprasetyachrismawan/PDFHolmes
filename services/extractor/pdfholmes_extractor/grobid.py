"""Klien GROBID: PDF -> TEI XML, lalu parse jadi sections + metadata terstruktur.

GROBID khusus artikel ilmiah (§5): pisahkan judul/penulis/abstrak/section/referensi.
Gagal/timeout GROBID tidak fatal — extractor tetap simpan teks PyMuPDF.
"""
from __future__ import annotations

import logging

import httpx
from lxml import etree

from . import config

log = logging.getLogger("extractor.grobid")

_TEI_NS = {"tei": "http://www.tei-c.org/ns/1.0"}


def is_alive(timeout: float = 5.0) -> bool:
    try:
        r = httpx.get(f"{config.GROBID_URL}/api/isalive", timeout=timeout)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


def process_fulltext(pdf_bytes: bytes, timeout: float = 120.0) -> str | None:
    """Kirim PDF -> TEI XML. None bila GROBID nonaktif/gagal."""
    if not config.GROBID_ENABLED:
        return None
    try:
        files = {"input": ("paper.pdf", pdf_bytes, "application/pdf")}
        data = {
            "consolidateHeader": "1",
            "segmentSentences": "0",
            "teiCoordinates": "0",
        }
        r = httpx.post(
            f"{config.GROBID_URL}/api/processFulltextDocument",
            files=files,
            data=data,
            timeout=timeout,
        )
        if r.status_code == 200:
            return r.text
        log.warning("GROBID status %s", r.status_code)
    except httpx.HTTPError as exc:
        log.warning("GROBID gagal: %s", exc)
    return None


def parse_tei(tei_xml: str) -> tuple[dict, dict]:
    """Kembalikan (metadata, sections) dari TEI XML."""
    metadata: dict = {}
    sections: dict = {}
    try:
        root = etree.fromstring(tei_xml.encode("utf-8"))
    except etree.XMLSyntaxError as exc:
        log.warning("TEI tak terparse: %s", exc)
        return metadata, sections

    def xp(expr: str):
        return root.xpath(expr, namespaces=_TEI_NS)

    # --- Metadata ---
    title = xp("//tei:titleStmt/tei:title/text()")
    metadata["title"] = title[0].strip() if title else None

    authors = []
    for pers in xp("//tei:sourceDesc//tei:author/tei:persName"):
        fore = pers.xpath("string(tei:forename)", namespaces=_TEI_NS).strip()
        sur = pers.xpath("string(tei:surname)", namespaces=_TEI_NS).strip()
        name = " ".join(p for p in (fore, sur) if p)
        if name:
            authors.append(name)
    metadata["authors"] = authors

    doi = xp("//tei:idno[@type='DOI']/text()")
    metadata["doi"] = doi[0].strip() if doi else None

    date = xp("//tei:publicationStmt/tei:date/@when") or xp("//tei:imprint/tei:date/@when")
    metadata["date"] = date[0] if date else None

    keywords = [k.strip() for k in xp("//tei:keywords//tei:term/text()") if k.strip()]
    metadata["keywords"] = keywords

    # --- Abstract ---
    abstract_parts = xp("//tei:profileDesc/tei:abstract//text()")
    abstract = " ".join(t.strip() for t in abstract_parts if t.strip())
    if abstract:
        sections["abstract"] = abstract

    # --- Body sections (per <div> dgn head) ---
    for div in xp("//tei:text/tei:body/tei:div"):
        head = div.xpath("string(tei:head)", namespaces=_TEI_NS).strip()
        body_parts = div.xpath(".//tei:p//text()", namespaces=_TEI_NS)
        body = " ".join(t.strip() for t in body_parts if t.strip())
        if head and body:
            sections[head] = body

    # --- Referensi (judul + tahun) ---
    refs = []
    for bibl in xp("//tei:listBibl/tei:biblStruct"):
        rtitle = bibl.xpath("string(.//tei:title)", namespaces=_TEI_NS).strip()
        ryear = bibl.xpath("string(.//tei:date/@when)", namespaces=_TEI_NS).strip()
        if rtitle:
            refs.append({"title": rtitle, "year": ryear or None})
    if refs:
        sections["_references"] = refs

    return metadata, sections
