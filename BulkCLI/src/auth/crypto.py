"""Per-user credential encryption for MeroShare secrets.

Fernet (AES-128-CBC + HMAC) with a per-user key derived from the app-wide
ENCRYPTION_KEY via PBKDF2-HMAC-SHA256. The per-user salt scopes keys so one
user's ciphertext can never be decrypted with another user's key, and Fernet's
random IV makes every ciphertext unique.
"""

import base64
from functools import lru_cache

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from src.config.security import ENCRYPTION_KEY

ITERATIONS = 600_000


@lru_cache(maxsize=4096)
def _derive_key(user_id: int) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=f"hissa-user-{user_id}".encode(),
        iterations=ITERATIONS,
    )
    raw = kdf.derive(ENCRYPTION_KEY.encode())
    return base64.urlsafe_b64encode(raw)


def encrypt(text: str, user_id: int) -> str:
    return Fernet(_derive_key(user_id)).encrypt(text.encode()).decode()


def decrypt(token: str, user_id: int) -> str:
    return Fernet(_derive_key(user_id)).decrypt(token.encode()).decode()
