"""Service internal codex-auth — device-flow login Codex/ChatGPT (§8.2).

Alur:
  POST /device/start {userId}  -> spawn `codex login --device-code`, parse
                                  verification URL + user code dari stdout.
  GET  /device/status/{id}     -> pending(+url,code) | complete | error
  Saat login selesai: baca ~/.codex/auth.json (berisi refresh token), enkripsi,
  simpan ke ai_credentials (provider=codex, auth_type=oauth_codex) utk userId.

Mode mock (CODEX_DEVICE_MOCK=true): fabrikasi URL/kode + simpan kredensial dummy,
agar UI device-flow bisa diuji tanpa akun ChatGPT nyata.

⚠️ ToS OpenAI (§8.3): auth langganan ChatGPT utk pemakaian personal/self-host.
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile
import threading
import time
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from . import config
from .common import db_connect
from .crypto import encrypt

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("codex-auth")

app = FastAPI(title="pdfholmes-codex-auth")

# session_id -> {status, userId, makeDefault, model, verificationUri, userCode, error, log}
_sessions: dict[str, dict] = {}
_lock = threading.Lock()

_URL_RE = re.compile(r"https?://[^\s'\"]+")
# Kode device biasanya 8 char alfanumerik, kadang dgn tanda hubung (XXXX-XXXX).
_CODE_RE = re.compile(r"\b([A-Z0-9]{4}-[A-Z0-9]{4}|[A-Z0-9]{6,10})\b")


class StartReq(BaseModel):
    userId: str
    makeDefault: bool = True
    model: str | None = None


def _store_credential(user_id: str, auth_json: str, model: str | None,
                      make_default: bool) -> None:
    ct, nonce = encrypt(auth_json)
    conn = db_connect()
    try:
        with conn.cursor() as cur:
            if make_default:
                cur.execute(
                    "UPDATE ai_credentials SET is_default=false "
                    "WHERE user_id=%s AND is_default",
                    (user_id,),
                )
            cur.execute(
                """INSERT INTO ai_credentials
                     (user_id, provider, auth_type, label,
                      secret_ciphertext, secret_nonce, model, is_default)
                   VALUES (%s, 'codex'::ai_provider, 'oauth_codex'::ai_auth_type,
                           %s, %s, %s, %s, %s)""",
                (user_id, "ChatGPT (device login)", ct, nonce,
                 model or config.CODEX_DEFAULT_MODEL, make_default),
            )
        conn.commit()
    finally:
        conn.close()


def _set(session_id: str, **kw) -> None:
    with _lock:
        _sessions[session_id].update(kw)


def _run_mock(session_id: str, req: StartReq) -> None:
    _set(session_id, status="pending",
         verificationUri="https://auth.openai.com/device",
         userCode="MOCK-CODE")
    time.sleep(6)  # simulasikan user membuka link & menyetujui
    fake = json.dumps({
        "note": "mock device login (CODEX_DEVICE_MOCK=true)",
        "tokens": {"access_token": "mock-access", "refresh_token": "mock-refresh"},
    })
    try:
        _store_credential(req.userId, fake, req.model, req.makeDefault)
        _set(session_id, status="complete")
    except Exception as exc:  # noqa: BLE001
        log.exception("mock store gagal")
        _set(session_id, status="error", error=str(exc)[:300])


def _run_real(session_id: str, req: StartReq) -> None:
    home = tempfile.mkdtemp(prefix="codexhome-")
    env = {**os.environ, "CODEX_HOME": home}
    try:
        proc = subprocess.Popen(
            config.CODEX_LOGIN_CMD.split(),
            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
    except FileNotFoundError:
        _set(session_id, status="error",
             error="Codex CLI tidak terpasang (build image dgn INSTALL_CODEX=true).")
        return

    url = code = None
    buf = ""
    # Baca stdout sampai dapat URL+kode, lalu sampai proses selesai.
    assert proc.stdout is not None
    for line in proc.stdout:
        buf += line
        if not url:
            m = _URL_RE.search(line)
            if m:
                url = m.group(0)
        if not code:
            m = _CODE_RE.search(line)
            if m:
                code = m.group(1)
        if url and code:
            _set(session_id, status="pending", verificationUri=url, userCode=code)
        if any(s in line.lower() for s in ("logged in", "success", "authenticated")):
            break

    try:
        proc.wait(timeout=config.CODEX_DEVICE_TIMEOUT)
    except subprocess.TimeoutExpired:
        proc.kill()
        _set(session_id, status="error", error="timeout menunggu persetujuan", log=buf[-2000:])
        return

    auth_path = os.path.join(home, "auth.json")
    if os.path.exists(auth_path):
        with open(auth_path, encoding="utf-8") as fh:
            auth_json = fh.read()
        try:
            _store_credential(req.userId, auth_json, req.model, req.makeDefault)
            _set(session_id, status="complete")
        except Exception as exc:  # noqa: BLE001
            _set(session_id, status="error", error=str(exc)[:300])
    else:
        _set(session_id, status="error",
             error="auth.json tidak ditemukan setelah login", log=buf[-2000:])


@app.post("/device/start")
def device_start(req: StartReq) -> dict:
    if not req.userId:
        raise HTTPException(400, "userId wajib")
    session_id = uuid.uuid4().hex
    with _lock:
        _sessions[session_id] = {
            "status": "starting", "userId": req.userId,
            "makeDefault": req.makeDefault, "model": req.model,
        }
    runner = _run_mock if config.CODEX_DEVICE_MOCK else _run_real
    threading.Thread(target=runner, args=(session_id, req), daemon=True).start()
    return {"sessionId": session_id, "status": "starting",
            "mock": config.CODEX_DEVICE_MOCK}


@app.get("/device/status/{session_id}")
def device_status(session_id: str) -> dict:
    with _lock:
        s = _sessions.get(session_id)
        if not s:
            raise HTTPException(404, "session tidak ditemukan")
        return {
            "status": s.get("status"),
            "verificationUri": s.get("verificationUri"),
            "userCode": s.get("userCode"),
            "error": s.get("error"),
        }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "codex-auth",
            "mock": config.CODEX_DEVICE_MOCK, "codexEnabled": config.CODEX_ENABLED}
