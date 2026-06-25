"""Lapisan abstraksi AIProvider (§8.4).

Implementasi: OpenAIKeyProvider, AnthropicKeyProvider, OpenAICompatibleProvider,
GoogleProvider, CodexSubscriptionProvider (Fase 5, stub), MockProvider (demo tanpa key).

Tiap provider:
  analyze_field(field_key, prompt, context, language) -> FieldResult
  embed(text) -> list[float] | None   (untuk pgvector; None bila tak didukung)
"""
from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass
from typing import Protocol

import httpx

from . import config

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


# ─────────────────────────── OpenAI (& compatible) ───────────────────────────
class OpenAICompatibleProvider:
    """OpenAI Chat Completions API; juga utk endpoint OpenAI-compatible (base_url)."""

    name = "openai_compatible"

    def __init__(self, api_key: str, model: str, base_url: str | None = None,
                 embed_model: str | None = "text-embedding-3-small"):
        self.api_key = api_key
        self.model = model or "gpt-4o-mini"
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self.embed_model = embed_model
        self._client = httpx.Client(timeout=120.0)

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def analyze_field(self, field_key, prompt, context, language, default_source) -> FieldResult:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": _system_prompt(language)},
                {"role": "user", "content": f"INSTRUKSI FIELD ({field_key}): {prompt}\n\n"
                                            f"KONTEKS PAPER:\n{context}"},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        r = self._client.post(f"{self.base_url}/chat/completions",
                              headers=self._headers(), json=body)
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        return _parse_result(content, default_source)

    def embed(self, text: str) -> list[float] | None:
        if not self.embed_model:
            return None
        try:
            r = self._client.post(
                f"{self.base_url}/embeddings",
                headers=self._headers(),
                json={"model": self.embed_model, "input": text[:8000]},
            )
            r.raise_for_status()
            return r.json()["data"][0]["embedding"]
        except httpx.HTTPError as exc:
            log.warning("embedding gagal: %s", exc)
            return None


class OpenAIKeyProvider(OpenAICompatibleProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str):
        super().__init__(api_key, model or "gpt-4o-mini", base_url=None)


# ─────────────────────────────── Anthropic ───────────────────────────────────
class AnthropicKeyProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model or "claude-3-5-sonnet-latest"
        self._client = httpx.Client(timeout=120.0)

    def analyze_field(self, field_key, prompt, context, language, default_source) -> FieldResult:
        body = {
            "model": self.model,
            "max_tokens": 1500,
            "system": _system_prompt(language),
            "messages": [
                {"role": "user", "content": f"INSTRUKSI FIELD ({field_key}): {prompt}\n\n"
                                            f"KONTEKS PAPER:\n{context}"},
            ],
        }
        r = self._client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
        )
        r.raise_for_status()
        text = "".join(b.get("text", "") for b in r.json().get("content", []))
        return _parse_result(text, default_source)

    def embed(self, text: str) -> list[float] | None:
        # Anthropic tak menyediakan embeddings; lewati (kolom nullable).
        return None


# ──────────────────────────────── Google ─────────────────────────────────────
class GoogleProvider:
    name = "google"

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model or "gemini-1.5-flash"
        self._client = httpx.Client(timeout=120.0)

    def analyze_field(self, field_key, prompt, context, language, default_source) -> FieldResult:
        url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
               f"{self.model}:generateContent?key={self.api_key}")
        body = {
            "system_instruction": {"parts": [{"text": _system_prompt(language)}]},
            "contents": [{"parts": [{"text": f"INSTRUKSI FIELD ({field_key}): {prompt}\n\n"
                                             f"KONTEKS PAPER:\n{context}"}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
        }
        r = self._client.post(url, json=body)
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        return _parse_result(text, default_source)

    def embed(self, text: str) -> list[float] | None:
        return None


# ───────────────────── Codex / ChatGPT subscription (Fase 5) ─────────────────
class CodexSubscriptionProvider:
    """Membungkus Codex CLI resmi (§8.2). STUB sampai CODEX_ENABLED + CLI terpasang.

    Saat aktif: tulis auth.json pengguna ke CODEX_HOME per-job (terisolasi), lalu
    jalankan `codex exec "<prompt>"` non-interaktif dan tangkap output JSON.
    ⚠️ Lihat §8.3: utamakan BYOK API key; mode ini utk pakai personal/self-host.
    """

    name = "codex"

    def __init__(self, auth_json: str, model: str, codex_home: str = "/tmp/codex-home"):
        self.auth_json = auth_json
        self.model = model or "gpt-5.1-codex"
        self.codex_home = codex_home

    def _ensure_auth(self) -> None:
        import os
        os.makedirs(self.codex_home, exist_ok=True)
        with open(os.path.join(self.codex_home, "auth.json"), "w", encoding="utf-8") as fh:
            fh.write(self.auth_json)

    def analyze_field(self, field_key, prompt, context, language, default_source) -> FieldResult:
        if not config.CODEX_ENABLED:
            raise RuntimeError(
                "Provider Codex nonaktif (CODEX_ENABLED=false). "
                "Gunakan BYOK API key, atau aktifkan Codex CLI di container analyzer."
            )
        self._ensure_auth()
        full_prompt = (f"{_system_prompt(language)}\n\n"
                       f"INSTRUKSI FIELD ({field_key}): {prompt}\n\nKONTEKS PAPER:\n{context}")
        import os
        env = {**os.environ, "CODEX_HOME": self.codex_home}
        proc = subprocess.run(
            ["codex", "exec", "--model", self.model, full_prompt],
            capture_output=True, text=True, env=env, timeout=180,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"codex exec gagal: {proc.stderr[:300]}")
        return _parse_result(proc.stdout, default_source)

    def embed(self, text: str) -> list[float] | None:
        return None


# ──────────────────── OpenCode Go (penyedia tunggal server, NON-BYOK) ─────────
class OpenCodeGoProvider:
    """Penyedia AI tunggal sisi-server lewat OpenCode Go (§AI).

    NON-BYOK: API key dibaca dari env server (OPENCODE_GO_API_KEY), tak pernah
    per-user. Routing mengikuti OPENCODE_GO_PROVIDER_TYPE:
      anthropic -> POST {base}/v1/messages   (header anthropic-version)
      openai    -> POST {base}/v1/chat/completions
    Auth selalu: Authorization: Bearer <key>.
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
        headers = {
            "Authorization": f"Bearer {self.api_key}",
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


# ──────────────────────────────── Factory ────────────────────────────────────
def load_provider(provider: str, auth_type: str, secret: str,
                  model: str | None, base_url: str | None) -> AIProvider:
    if provider == "openai":
        return OpenAIKeyProvider(secret, model or "gpt-4o-mini")
    if provider == "openai_compatible":
        return OpenAICompatibleProvider(secret, model or "gpt-4o-mini", base_url=base_url)
    if provider == "anthropic":
        return AnthropicKeyProvider(secret, model or "claude-3-5-sonnet-latest")
    if provider == "google":
        return GoogleProvider(secret, model or "gemini-1.5-flash")
    if provider == "codex":
        return CodexSubscriptionProvider(secret, model or "gpt-5.1-codex")
    raise ValueError(f"provider tak dikenal: {provider}")
