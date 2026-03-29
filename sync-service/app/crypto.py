"""AES-256-GCM encryption for API keys at rest."""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# 32 bytes = AES-256. Generate once, store in env.
_KEY_HEX = os.getenv("SYNC_ENCRYPTION_KEY", "")


def _get_key() -> bytes:
    if not _KEY_HEX:
        raise RuntimeError("SYNC_ENCRYPTION_KEY env var not set. Generate with: python -c \"import os; print(os.urandom(32).hex())\"")
    return bytes.fromhex(_KEY_HEX)


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt an API key. Returns base64-encoded nonce+ciphertext."""
    key = _get_key()
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt_api_key(encrypted: str) -> str:
    """Decrypt an API key from base64-encoded nonce+ciphertext."""
    key = _get_key()
    raw = base64.b64decode(encrypted)
    nonce, ct = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")
