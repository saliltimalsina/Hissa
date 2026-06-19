"""Pure unit tests for src.auth.crypto (TARGET-1).

No DB, no network, no app fixtures — just the encrypt/decrypt round-trip,
per-user key isolation, ciphertext uniqueness, and the _derive_key cache.

ENCRYPTION_KEY is set by tests/conftest.py BEFORE any `src.*` import (it is read
at import time in src.config.security). conftest runs first, so importing the
module here is safe.
"""

import pytest
from cryptography.fernet import InvalidToken

from src.auth import crypto


# ── (a) round-trip: decrypt(encrypt(s)) == s across content shapes ─────────────
@pytest.mark.parametrize(
    "plaintext",
    [
        pytest.param("hello-meroshare-secret", id="ascii"),
        pytest.param("नमस्ते 🙏 σ ω — unicode/emoji", id="unicode"),
        pytest.param("", id="empty"),
        pytest.param("x" * 100_000, id="very-long"),
    ],
)
def test_round_trip(plaintext):
    user_id = 42
    token = crypto.encrypt(plaintext, user_id)
    assert isinstance(token, str)
    assert crypto.decrypt(token, user_id) == plaintext


# ── (b) cross-user decryption is rejected (per-user salt scopes the key) ───────
def test_decrypt_with_other_users_id_raises_invalid_token():
    user_a, user_b = 1001, 1002
    token = crypto.encrypt("user-a-only", user_a)
    with pytest.raises(InvalidToken):
        crypto.decrypt(token, user_b)


# ── (c) ciphertext is non-deterministic (Fernet random IV/timestamp) ───────────
def test_two_encrypts_of_same_input_differ():
    user_id = 7
    plaintext = "same-plaintext-same-user"
    first = crypto.encrypt(plaintext, user_id)
    second = crypto.encrypt(plaintext, user_id)
    assert first != second
    # ...but both still decrypt back to the original.
    assert crypto.decrypt(first, user_id) == plaintext
    assert crypto.decrypt(second, user_id) == plaintext


# ── (d) _derive_key is memoized: repeated calls return the cached same object ──
def test_derive_key_is_cached():
    user_id = 555_001  # uid unlikely to be primed by other tests
    key_first = crypto._derive_key(user_id)
    key_second = crypto._derive_key(user_id)
    # lru_cache returns the *same* object, not just an equal one.
    assert key_first is key_second
    # Sanity: different users derive different keys.
    assert crypto._derive_key(user_id + 1) != key_first
