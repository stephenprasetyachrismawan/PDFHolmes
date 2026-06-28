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


# Instruksi sistem: paksa output JSON terstruktur per field.
def _system_prompt(language: str) -> str:
    return (
        "Anda PDFHo!mes, asisten analisis paper ilmiah yang teliti dan jujur. "
        "Bedakan dengan tegas antara fakta yang DINYATAKAN penulis (extracted) dan "
        "INFERENSI Anda (inferred); gunakan 'hybrid' bila campuran. "
        f"Jawab dalam bahasa: {language}. "
        "Balas HANYA JSON valid dengan kunci: "
        '{"content": "<markdown>", "source": "extracted|inferred|hybrid", '
        '"confidence": <0..1>}. '
        "Jika informasi tidak ada di teks, nyatakan itu secara eksplisit di content."
    )


def _parse_result(raw: str, default_source: str) -> FieldResult:
    raw = raw.strip()
    # Bersihkan code fence bila ada.
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1].lstrip("json").strip() if "```" in raw[3:] else raw.strip("`")
    try:
        obj = json.loads(raw)
        return FieldResult(
            content_md=str(obj.get("content", "")).strip(),
            source=obj.get("source", default_source) or default_source,
            confidence=_as_float(obj.get("confidence")),
        )
    except (json.JSONDecodeError, AttributeError):
        # Fallback: pakai teks mentah sbg content.
        return FieldResult(content_md=raw, source=default_source)


def _as_float(v) -> float | None:
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


class AIProvider(Protocol):
    name: str

    def analyze_field(self, field_key: str, prompt: str, context: str,
                      language: str, default_source: str) -> FieldResult: ...

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

    def analyze_field(self, field_key, prompt, context, language, default_source) -> FieldResult:
        if self.provider_type == "openai":
            url = f"{self.base_url}/v1/chat/completions"
            body = {
                "model": self.model,
                "max_tokens": self.max_tokens,
                "messages": [
                    {"role": "system", "content": _system_prompt(language)},
                    {"role": "user", "content": self._user_content(field_key, prompt, context)},
                ],
            }
            headers = {"Authorization": f"Bearer {self.api_key}",
                       "Content-Type": "application/json"}
            r = self._client.post(url, headers=headers, json=body)
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
            return _parse_result(text, default_source)

        # default: anthropic-style messages
        url = f"{self.base_url}/v1/messages"
        body = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": _system_prompt(language),
            "messages": [
                {"role": "user", "content": self._user_content(field_key, prompt, context)},
            ],
        }
        # Protokol Anthropic pakai header x-api-key (BUKAN Authorization: Bearer),
        # kalau tidak server balas 401 "Missing API key."
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        r = self._client.post(url, headers=headers, json=body)
        r.raise_for_status()
        text = "".join(b.get("text", "") for b in r.json().get("content", []))
        return _parse_result(text, default_source)

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

    def embed(self, text: str) -> list[float] | None:
        return None  # tak ada embedding di mode mock
