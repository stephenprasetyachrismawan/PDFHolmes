"""Lapisan abstraksi AIProvider (NON-BYOK).

Implementasi: OpenCodeGoProvider (penyedia tunggal sisi-server), MockProvider
(demo end-to-end tanpa API key).

Tiap provider:
  analyze_field(field_key, prompt, context, language) -> FieldResult
  embed(text) -> list[float] | None   (untuk pgvector; None bila tak didukung)
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

log = logging.getLogger("analyzer.provider")


@dataclass
class FieldResult:
    content_md: str
    source: str = "inferred"        # extracted | inferred | hybrid
    confidence: float | None = None


# Batas keras panjang konten per field (karakter).
MAX_CONTENT_CHARS = 700

# Instruksi sistem: paksa output JSON terstruktur + format penulisan ketat.
def _system_prompt(language: str) -> str:
    return (
        "Anda PDFHo!mes, asisten analisis paper ilmiah yang teliti dan jujur. "
        "Bedakan dengan tegas antara fakta yang DINYATAKAN penulis (extracted) dan "
        "INFERENSI Anda (inferred); gunakan 'hybrid' bila campuran. "
        f"Jawab dalam bahasa: {language}.\n"
        "ATURAN FORMAT (WAJIB, ketat):\n"
        "- Ringkas, maksimal 100 kata. Langsung ke inti, tanpa kalimat pembuka.\n"
        "- Satu paragraf pendek, ATAU maksimal 4 poin '- ' (bullet) singkat.\n"
        "- DILARANG: judul/heading (#), tabel, blok kode (```), tautan, gambar, "
        "emoji, dan kutipan panjang.\n"
        "- Boleh **tebal** hanya untuk 1-2 istilah kunci. Tanpa daftar bertingkat.\n"
        "- Jika informasi tidak ada di teks, tulis tepat satu kalimat: "
        "\"Tidak dinyatakan dalam teks.\"\n"
        "Balas HANYA JSON valid satu baris dengan kunci: "
        '{"content": "<markdown ringkas>", "source": "extracted|inferred|hybrid", '
        '"confidence": <0..1>}.'
    )


# Rapikan markdown agar konsisten & ringkas: buang heading, fence, tabel; padatkan
# baris kosong; potong ke batas keras. LLM kadang abai aturan -> ditegakkan di kode.
def _clean_content(text: str) -> str:
    import re

    text = (text or "").strip()
    text = text.replace("\x00", "")
    # Buang blok kode/fence.
    text = re.sub(r"```[a-zA-Z]*", "", text)
    text = text.replace("```", "")
    lines = []
    for line in text.splitlines():
        s = line.rstrip()
        # Heading markdown -> jadikan teks biasa (tebalkan).
        m = re.match(r"^\s*#{1,6}\s+(.*)$", s)
        if m:
            head = m.group(1).strip().rstrip("#").strip()
            s = f"**{head}**" if head else ""
        # Baris pemisah tabel / garis horizontal -> buang.
        if re.match(r"^\s*\|?[\s:|-]+\|?\s*$", s) and ("|" in s or "-" in s) and len(s) > 2:
            continue
        # Baris data tabel (| a | b |) -> jadikan teks biasa "a · b".
        if s.strip().startswith("|") and s.strip().endswith("|"):
            cells = [c.strip() for c in s.strip().strip("|").split("|")]
            s = " · ".join(c for c in cells if c)
        lines.append(s)
    text = "\n".join(lines)
    # Padatkan >2 baris kosong jadi 1 baris kosong.
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    # Batas keras panjang.
    if len(text) > MAX_CONTENT_CHARS:
        text = text[:MAX_CONTENT_CHARS].rstrip() + "…"
    return text


def _parse_result(raw: str, default_source: str) -> FieldResult:
    raw = raw.strip()
    # Bersihkan code fence bila ada.
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1].lstrip("json").strip() if "```" in raw[3:] else raw.strip("`")
    try:
        obj = json.loads(raw)
        return FieldResult(
            content_md=_clean_content(str(obj.get("content", ""))),
            source=obj.get("source", default_source) or default_source,
            confidence=_as_float(obj.get("confidence")),
        )
    except (json.JSONDecodeError, AttributeError):
        # Fallback: pakai teks mentah (tetap dirapikan + dipotong).
        return FieldResult(content_md=_clean_content(raw), source=default_source)


def _as_float(v) -> float | None:
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


# ───────────── Mode BATCH: 1 panggilan utk SEMUA field ─────────────
def _batch_system_prompt(language: str) -> str:
    return (
        "Anda PDFHo!mes, asisten analisis paper ilmiah yang teliti dan jujur. "
        "Anda menganalisis SATU paper dan mengisi BANYAK field sekaligus. "
        "Bedakan fakta yang DINYATAKAN penulis (extracted) dari INFERENSI Anda "
        "(inferred); 'hybrid' bila campuran. "
        f"Jawab dalam bahasa: {language}.\n"
        "ATURAN FORMAT tiap content (WAJIB, ketat):\n"
        "- Ringkas, maksimal 100 kata. Langsung ke inti, tanpa pembuka.\n"
        "- Satu paragraf pendek ATAU maksimal 4 poin '- ' singkat.\n"
        "- DILARANG: heading (#), tabel, blok kode (```), tautan, gambar, emoji.\n"
        "- Boleh **tebal** untuk 1-2 istilah kunci. Tanpa daftar bertingkat.\n"
        "- Jika info tak ada di teks: tepat satu kalimat \"Tidak dinyatakan dalam teks.\"\n"
        "Balas HANYA satu objek JSON valid. Kunci = key field. Nilai tiap key = "
        '{"content":"<markdown ringkas>","source":"extracted|inferred|hybrid",'
        '"confidence":<0..1>}. Wajib sertakan SEMUA key yang diminta, tanpa teks lain.'
    )


def _batch_user_prompt(fields, context) -> str:
    lines = ["DAFTAR FIELD (isi semua, pakai key persis sebagai kunci JSON):"]
    for f in fields:
        lines.append(f"- {f.key}: {f.prompt}")
    return "\n".join(lines) + f"\n\nKONTEKS PAPER:\n{context}"


def _extract_json_object(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1].lstrip("json").strip() if "```" in raw[3:] else raw.strip("`")
    # Ambil dari '{' pertama sampai '}' terakhir (tahan teks pembungkus / sebagian).
    i, j = raw.find("{"), raw.rfind("}")
    return raw[i : j + 1] if i != -1 and j > i else raw


def _salvage_field(raw: str, key: str):
    """Ambil objek satu field "key": { ... } dari JSON yang mungkin terpotong.
    Brace-balancing sederhana (sadar string + escape) -> tahan output terpotong di
    tengah, sehingga truncation hanya kehilangan field ekor, BUKAN semuanya."""
    import re

    m = re.search(r'"' + re.escape(key) + r'"\s*:\s*\{', raw)
    if not m:
        return None
    start = m.end() - 1  # posisi '{'
    depth = 0
    in_str = False
    esc = False
    for j in range(start, len(raw)):
        c = raw[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(raw[start : j + 1])
                except json.JSONDecodeError:
                    return None
    return None  # terpotong sebelum objek selesai


def _to_result(item, default_source: str):
    if isinstance(item, dict) and str(item.get("content", "")).strip():
        return FieldResult(
            content_md=_clean_content(str(item.get("content", ""))),
            source=item.get("source", default_source) or default_source,
            confidence=_as_float(item.get("confidence")),
        )
    if isinstance(item, str) and item.strip():
        return FieldResult(content_md=_clean_content(item), source=default_source)
    return None


def _parse_batch(raw: str, fields) -> dict:
    """Pisah satu JSON jadi {field_key: FieldResult}. Toleran JSON terpotong:
    coba parse penuh dulu, lalu salvage per-key utk yang hilang. Field yang benar2
    tak ada -> fallback 'Tidak dinyatakan'."""
    obj = {}
    try:
        parsed = json.loads(_extract_json_object(raw))
        if isinstance(parsed, dict):
            obj = parsed
    except json.JSONDecodeError:
        obj = {}

    results: dict = {}
    for f in fields:
        res = _to_result(obj.get(f.key), f.default_source)
        if res is None:  # hilang / kosong -> coba salvage dari teks mentah
            res = _to_result(_salvage_field(raw, f.key), f.default_source)
        results[f.key] = res or FieldResult(
            content_md="Tidak dinyatakan dalam teks.", source=f.default_source
        )
    return results


class AIProvider(Protocol):
    name: str

    def analyze_field(self, field_key: str, prompt: str, context: str,
                      language: str, default_source: str) -> FieldResult: ...

    def analyze_batch(self, fields, context: str, language: str,
                      max_tokens: int) -> dict: ...

    def embed(self, text: str) -> list[float] | None: ...


# ──────────────────── OpenCode Go (penyedia tunggal server, NON-BYOK) ─────────
class OpenCodeGoProvider:
    """Penyedia AI tunggal sisi-server lewat OpenCode Go (§AI).

    NON-BYOK: API key dibaca dari env server (OPENCODE_GO_API_KEY), tak pernah
    per-user. Routing mengikuti OPENCODE_GO_PROVIDER_TYPE:
      anthropic -> POST {base}/v1/messages   (header anthropic-version)
      openai    -> POST {base}/v1/chat/completions
    Auth: anthropic -> header x-api-key; openai -> Authorization: Bearer.
    """

    name = "opencode_go"

    def __init__(self, api_key: str, model: str, base_url: str,
                 provider_type: str = "anthropic", max_tokens: int = 2000):
        self.api_key = api_key
        self.model = model or "minimax-m2.7"
        self.base_url = (base_url or "https://opencode.ai/zen/go").rstrip("/")
        self.provider_type = (provider_type or "anthropic").lower()
        self.max_tokens = max_tokens
        self._client = httpx.Client(timeout=120.0)

    def _user_content(self, field_key, prompt, context) -> str:
        return (f"INSTRUKSI FIELD ({field_key}): {prompt}\n\n"
                f"KONTEKS PAPER:\n{context}")

    # Satu panggilan chat mentah (routing anthropic/openai), kembalikan teks.
    def _raw_chat(self, system: str, user: str, max_tokens: int) -> str:
        if self.provider_type == "openai":
            url = f"{self.base_url}/v1/chat/completions"
            body = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            }
            headers = {"Authorization": f"Bearer {self.api_key}",
                       "Content-Type": "application/json"}
            r = self._client.post(url, headers=headers, json=body)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

        # default: anthropic-style messages. Header x-api-key (BUKAN Bearer).
        url = f"{self.base_url}/v1/messages"
        body = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        r = self._client.post(url, headers=headers, json=body)
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json().get("content", []))

    def analyze_field(self, field_key, prompt, context, language, default_source) -> FieldResult:
        text = self._raw_chat(
            _system_prompt(language), self._user_content(field_key, prompt, context),
            self.max_tokens,
        )
        return _parse_result(text, default_source)

    # SATU panggilan untuk SEMUA field: AI balas satu JSON {key: {content,...}},
    # sistem memisah & menyimpan per field. Jauh lebih cepat dari 48 panggilan.
    def analyze_batch(self, fields, context, language, max_tokens) -> dict:
        text = self._raw_chat(
            _batch_system_prompt(language), _batch_user_prompt(fields, context), max_tokens,
        )
        return _parse_batch(text, fields)

    def embed(self, text: str) -> list[float] | None:
        # OpenCode Go tak menjamin endpoint embeddings; lewati (kolom nullable).
        return None


# ──────────────────────────────── Mock ───────────────────────────────────────
class MockProvider:
    """Provider deterministik tanpa API — demo pipeline end-to-end tanpa kredensial."""

    name = "mock"

    def analyze_field(self, field_key, prompt, context, language, default_source) -> FieldResult:
        snippet = (context or "").strip().replace("\n", " ")[:200]
        content = (
            f"*(Mock {language})* Analisis untuk **{field_key}**.\n\n"
            f"> Instruksi: {prompt}\n\n"
            f"Cuplikan konteks: {snippet or '(kosong)'}…\n\n"
            f"_Setel OPENCODE_GO_API_KEY di server untuk hasil AI sungguhan._"
        )
        return FieldResult(content_md=content, source=default_source, confidence=0.1)

    def analyze_batch(self, fields, context, language, max_tokens) -> dict:
        return {
            f.key: self.analyze_field(f.key, f.prompt, context, language, f.default_source)
            for f in fields
        }

    def embed(self, text: str) -> list[float] | None:
        return None  # tak ada embedding di mode mock
