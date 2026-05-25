import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

SECRET_KEY = os.getenv("NCAP_SECRET_KEY", "ncap-default-secret-change-in-production-2024")


def _derive_key(user_id: int) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=str(user_id).encode(),
        iterations=100_000,
    )
    raw = kdf.derive(SECRET_KEY.encode())
    return base64.urlsafe_b64encode(raw)


def encrypt(text: str, user_id: int) -> str:
    f = Fernet(_derive_key(user_id))
    return f.encrypt(text.encode()).decode()


def decrypt(token: str, user_id: int) -> str:
    f = Fernet(_derive_key(user_id))
    return f.decrypt(token.encode()).decode()
