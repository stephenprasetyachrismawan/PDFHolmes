"""Dekripsi kredensial AI. Cermin apps/api CryptoService (AES-256-GCM).

Format DB: secret_ciphertext = enc||tag(16B), secret_nonce = 12B.
Kunci: CREDENTIAL_ENC_KEY (base64 32B, atau utf8 di-pad ke 32B).
"""
from __future__ import annotations

import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from . import config


def _key() -> bytes:
    raw = config.CREDENTIAL_ENC_KEY
    try:
        buf = base64.b64decode(raw)
    except Exception:
        buf = b""
    if len(buf) != 32:
        buf = raw.ljust(32, "_")[:32].encode("utf-8")
    return buf


def decrypt(ciphertext: bytes, nonce: bytes) -> str:
    aes = AESGCM(_key())
    # AESGCM.decrypt menerima ct||tag, sama dgn yg ditulis api.
    plaintext = aes.decrypt(bytes(nonce), bytes(ciphertext), None)
    return plaintext.decode("utf-8")


def encrypt(plaintext: str) -> tuple[bytes, bytes]:
    """Cermin apps/api CryptoService.encrypt: kembalikan (ct||tag, nonce 12B)."""
    import os

    nonce = os.urandom(12)
    aes = AESGCM(_key())
    ct = aes.encrypt(nonce, plaintext.encode("utf-8"), None)  # ct||tag
    return ct, nonce
