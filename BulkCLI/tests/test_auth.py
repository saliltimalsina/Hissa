"""Auth test suite (TARGET-2).

Covers the three auth modules:
  * src/auth/jwt_handler.py  — decode_token hardening (type, signature, expiry,
    non-int sub) and the create/decode round-trip.
  * src/routers/auth.py      — _hash_password/_verify_password round-trip and
    _validate_password boundary behaviour.
  * src/auth/session.py + the routers — end-to-end cookie session + double-submit
    CSRF, /api/auth/me gating, CSRF enforcement on a mutating route, and the
    no-user-enumeration property of /api/auth/forgot-password.

Everything runs hermetically: tokens are minted in-process with the same
JWT_SECRET the app loaded (set by conftest before import), and any outbound
email / MeroShare is mocked so nothing hits the network.
"""

from datetime import datetime, timedelta

import pytest
from jose import jwt

from src.auth.jwt_handler import (
    ALGORITHM,
    COOKIE_NAME,
    create_token,
    decode_token,
)
from src.config.security import JWT_SECRET
from src.routers.auth import (
    LEGACY_ITERATIONS,
    MAX_FAILED_LOGINS,
    _hash_password,
    _needs_rehash,
    _validate_password,
    _verify_password,
)
from src.auth.session import CSRF_COOKIE, CSRF_HEADER
from src.config.ratelimit import limiter
from src.db.models import User


# ── rate-limit isolation ──────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """slowapi keeps an in-process per-IP bucket that otherwise bleeds across
    tests in this module (signup is 5/min, login 10/min, forgot 3/min). Every
    integration test — and the authed_client fixture's own signup+login — keys
    on the same "testclient" address, so without a reset the later tests trip
    HTTP 429. Clear the storage before each test for a clean budget."""
    storage = getattr(limiter, "_storage", None)
    reset = getattr(storage, "reset", None)
    if callable(reset):
        reset()
    yield


def _reset_limiter_storage():
    """Clear slowapi's per-IP bucket mid-test (helper for tests that must make
    more login calls than the 10/min IP limit to exercise account-level logic)."""
    storage = getattr(limiter, "_storage", None)
    reset = getattr(storage, "reset", None)
    if callable(reset):
        reset()


# ── helpers ─────────────────────────────────────────────────────────────────
def _encode(payload: dict, *, secret: str = JWT_SECRET) -> str:
    """Mint a JWT with the app's algorithm; secret overridable to forge."""
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


# ──────────────────────────────────────────────────────────────────────────────
# UNIT: decode_token hardening
# ──────────────────────────────────────────────────────────────────────────────
def test_decode_token_roundtrip():
    """create_token -> decode_token recovers the integer user id."""
    token = create_token(42)
    assert decode_token(token) == 42


def test_decode_token_rejects_wrong_type():
    """A structurally valid, correctly signed token whose `type` claim is not
    `session` must be rejected (returns None), not accepted."""
    token = _encode({"sub": "1", "type": "refresh"})
    assert decode_token(token) is None


def test_decode_token_rejects_missing_type():
    """No `type` claim at all is also not a session token."""
    token = _encode({"sub": "1"})
    assert decode_token(token) is None


def test_decode_token_rejects_tampered_signature():
    """Mutating a character inside the signature segment invalidates the HMAC;
    decode_token swallows the JWTError and returns None.

    NB: we mutate the *first* char of the signature rather than the last. The
    signature is base64url-encoded HMAC bytes whose final character only carries
    a couple of significant bits, so flipping just the last char can decode to
    the identical byte string and still verify. Touching a non-terminal char
    always changes a whole signature byte."""
    token = create_token(7)
    head, sig = token.rsplit(".", 1)
    first = sig[0]
    flipped = "A" if first != "A" else "B"
    tampered = head + "." + flipped + sig[1:]
    assert tampered != token
    assert decode_token(tampered) is None


def test_decode_token_rejects_wrong_secret():
    """A token signed with a different secret fails signature verification."""
    token = _encode({"sub": "1", "type": "session"}, secret="a-totally-different-secret-value")
    assert decode_token(token) is None


def test_decode_token_rejects_expired():
    """An otherwise-valid session token whose exp is in the past is rejected.

    jose validates `exp` and raises ExpiredSignatureError (a JWTError), which
    decode_token catches -> None."""
    expired = _encode(
        {
            "sub": "1",
            "type": "session",
            "iat": datetime.utcnow() - timedelta(hours=2),
            "exp": datetime.utcnow() - timedelta(hours=1),
        }
    )
    assert decode_token(expired) is None


def test_decode_token_rejects_non_int_sub():
    """A non-integer `sub` triggers ValueError on int() -> None (caught)."""
    token = _encode({"sub": "not-a-number", "type": "session"})
    assert decode_token(token) is None


def test_decode_token_rejects_garbage():
    """A completely malformed token string is rejected, not raised."""
    assert decode_token("not.a.jwt") is None


# ──────────────────────────────────────────────────────────────────────────────
# UNIT: password hashing round-trip
# ──────────────────────────────────────────────────────────────────────────────
def test_hash_verify_roundtrip():
    stored = _hash_password("password123")
    assert _verify_password("password123", stored) is True


def test_verify_rejects_wrong_password():
    stored = _hash_password("password123")
    assert _verify_password("wrongpass456", stored) is False


def test_hash_is_salted_and_not_plaintext():
    """Each hash uses a fresh random salt, so two hashes of the same password
    differ, and the plaintext never appears in the stored value."""
    a = _hash_password("password123")
    b = _hash_password("password123")
    assert a != b
    assert "password123" not in a


def test_verify_handles_malformed_stored_value():
    """A corrupt/non-base64 stored hash must return False, never raise."""
    assert _verify_password("password123", "!!!not-base64!!!") is False


# ──────────────────────────────────────────────────────────────────────────────
# UNIT: password validation boundaries
# ──────────────────────────────────────────────────────────────────────────────
def test_validate_password_accepts_min_length():
    """Exactly 8 chars with a letter and a digit is the lower valid boundary."""
    assert _validate_password("abcd1234") == "abcd1234"


def test_validate_password_accepts_max_length():
    """Exactly 200 chars is still valid (reject is strictly > 200)."""
    pw = "a1" + "x" * 198  # length 200
    assert len(pw) == 200
    assert _validate_password(pw) == pw


def test_validate_password_too_short():
    """7 chars (< 8) is rejected."""
    with pytest.raises(ValueError, match="at least 8 characters"):
        _validate_password("abc1234")  # length 7


def test_validate_password_too_long():
    """201 chars (> 200) is rejected."""
    with pytest.raises(ValueError, match="too long"):
        _validate_password("a1" + "x" * 199)  # length 201


def test_validate_password_missing_digit():
    with pytest.raises(ValueError, match="both letters and numbers"):
        _validate_password("abcdefghij")


def test_validate_password_missing_letter():
    with pytest.raises(ValueError, match="both letters and numbers"):
        _validate_password("1234567890")


# ──────────────────────────────────────────────────────────────────────────────
# INTEGRATION: session + CSRF cookies, /me gating
# ──────────────────────────────────────────────────────────────────────────────
def test_signup_then_login_sets_session_and_csrf_cookies(client):
    """A fresh signup + login must set both the httpOnly session cookie and the
    readable double-submit CSRF cookie on the client jar."""
    creds = {"email": "flow@example.com", "password": "password123", "name": "Flow"}
    signup = client.post("/api/auth/signup", json=creds)
    assert signup.status_code == 200, signup.text

    login = client.post(
        "/api/auth/login",
        json={"email": creds["email"], "password": creds["password"]},
    )
    assert login.status_code == 200, login.text
    assert client.cookies.get(COOKIE_NAME), "session cookie not set"
    assert client.cookies.get(CSRF_COOKIE), "csrf cookie not set"
    assert login.json()["email"] == "flow@example.com"


def test_me_requires_session_cookie(client):
    """GET /api/auth/me with no session cookie -> 401."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_returns_user_with_session_cookie(authed_client):
    """GET /api/auth/me with a valid session cookie -> 200 and the user."""
    resp = authed_client.get("/api/auth/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == "tester@example.com"
    assert isinstance(body["user_id"], int)


def test_login_rejects_wrong_password(client):
    """Wrong password on login is a 401 and sets no session cookie."""
    client.post(
        "/api/auth/signup",
        json={"email": "wp@example.com", "password": "password123", "name": "WP"},
    )
    # Drop cookies set by signup so we test login in isolation.
    client.cookies.clear()
    resp = client.post(
        "/api/auth/login",
        json={"email": "wp@example.com", "password": "totally-wrong-1"},
    )
    assert resp.status_code == 401
    assert not client.cookies.get(COOKIE_NAME)


# ──────────────────────────────────────────────────────────────────────────────
# INTEGRATION: CSRF enforcement on a mutating route (POST /api/accounts)
# ──────────────────────────────────────────────────────────────────────────────
_ACCOUNT_BODY = {
    "username": "msuser1",
    "password": "secret-pw",
    "pin": "1234",
    "crn": "CRN001",
    "client_id": 1,
    "label": "Primary",
    "group_name": "Default",
}


def test_accounts_post_rejects_missing_csrf(authed_client, mock_meroshare):
    """POST /api/accounts with a valid session cookie but NO X-CSRF-Token header
    is rejected by require_csrf -> 403."""
    # Bypass the wrapper's auto-CSRF to send a header-less mutating request.
    resp = authed_client._c.post("/api/accounts", json=_ACCOUNT_BODY)
    assert resp.status_code == 403, resp.text
    assert "CSRF" in resp.json()["detail"]


def test_accounts_post_rejects_mismatched_csrf(authed_client, mock_meroshare):
    """A present-but-wrong X-CSRF-Token (does not match the hissa_csrf cookie)
    is rejected -> 403 (double-submit mismatch)."""
    resp = authed_client._c.post(
        "/api/accounts",
        json=_ACCOUNT_BODY,
        headers={CSRF_HEADER: "this-does-not-match-the-cookie"},
    )
    assert resp.status_code == 403, resp.text


def test_accounts_post_succeeds_with_matching_csrf(authed_client, mock_meroshare):
    """When X-CSRF-Token equals the hissa_csrf cookie (what the wrapper does
    automatically) the request passes CSRF and the account is created -> 200."""
    csrf = authed_client.cookies.get(CSRF_COOKIE)
    assert csrf, "expected a csrf cookie after login"

    resp = authed_client.post("/api/accounts", json=_ACCOUNT_BODY)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["username"] == "msuser1"
    assert body["client_id"] == 1
    # Sanity: it really persisted (listing returns it).
    listed = authed_client.get("/api/accounts")
    assert listed.status_code == 200
    assert any(a["username"] == "msuser1" for a in listed.json())


# ──────────────────────────────────────────────────────────────────────────────
# INTEGRATION: forgot-password does not leak whether an email exists
# ──────────────────────────────────────────────────────────────────────────────
def test_forgot_password_no_user_enumeration(client, monkeypatch):
    """POST /api/auth/forgot-password must return an identical body and status
    whether or not the email is registered (no user enumeration), and must not
    send real email."""
    sent = []

    def _fake_send(to, reset_url):
        sent.append((to, reset_url))
        return True

    # send_password_reset is imported into the router's namespace, so patch it
    # there (and at the source for good measure) to neutralize SMTP.
    monkeypatch.setattr("src.routers.auth.send_password_reset", _fake_send, raising=True)

    # Register one real user.
    creds = {"email": "real@example.com", "password": "password123", "name": "Real"}
    assert client.post("/api/auth/signup", json=creds).status_code == 200
    client.cookies.clear()

    existing = client.post("/api/auth/forgot-password", json={"email": "real@example.com"})
    missing = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})

    assert existing.status_code == missing.status_code == 200
    # Identical response body regardless of account existence.
    assert existing.json() == missing.json()
    assert existing.json().get("ok") is True

    # The email path only fired for the real user, and never hit the network.
    assert [to for to, _ in sent] == ["real@example.com"]


# ──────────────────────────────────────────────────────────────────────────────
# SEC-08: legacy (bare-base64, low-cost) hash still verifies + is upgraded
# ──────────────────────────────────────────────────────────────────────────────
import base64 as _b64
import hashlib as _hashlib


def _legacy_hash(password: str) -> str:
    """Re-create the OLD storage format: bare base64(salt+dk) at LEGACY_ITERATIONS,
    with no algo/cost tag prefix."""
    salt = b"\x00" * 16
    dk = _hashlib.pbkdf2_hmac("sha256", password.encode(), salt, LEGACY_ITERATIONS)
    return _b64.b64encode(salt + dk).decode()


def test_legacy_hash_still_verifies():
    """A password stored in the old bare-base64 / low-cost format must still
    verify so existing users are never locked out."""
    stored = _legacy_hash("password123")
    assert "$" not in stored  # genuinely the legacy untagged format
    assert _verify_password("password123", stored) is True
    assert _verify_password("wrongpass456", stored) is False


def test_new_hash_is_tagged_and_not_flagged_for_rehash():
    stored = _hash_password("password123")
    assert stored.startswith("pbkdf2_sha256$600000$")
    assert _needs_rehash(stored) is False
    assert _needs_rehash(_legacy_hash("password123")) is True


def test_login_upgrades_legacy_hash(client, db):
    """Logging in with a legacy-cost hash succeeds AND transparently re-hashes the
    password to the current tagged/high-cost format."""
    user = User(email="legacy@example.com", hashed_password=_legacy_hash("password123"), name="Legacy")
    db.add(user)
    db.commit()

    resp = client.post(
        "/api/auth/login",
        json={"email": "legacy@example.com", "password": "password123"},
    )
    assert resp.status_code == 200, resp.text

    db.refresh(user)
    assert user.hashed_password.startswith("pbkdf2_sha256$600000$")
    # Still verifies with the same password after the upgrade.
    assert _verify_password("password123", user.hashed_password) is True


# ──────────────────────────────────────────────────────────────────────────────
# SEC-03: token revocation — session dies after logout and after reset
# ──────────────────────────────────────────────────────────────────────────────
def test_session_revoked_after_logout(client, db):
    """Precise version with DB access: a token minted at the user's current
    token_version works; after logout bumps it, that same token is rejected."""
    creds = {"email": "revoke@example.com", "password": "password123", "name": "Rev"}
    assert client.post("/api/auth/signup", json=creds).status_code == 200
    # /me works with the live session cookie.
    assert client.get("/api/auth/me").status_code == 200

    user = db.query(User).filter(User.email == "revoke@example.com").first()
    from src.auth.jwt_handler import create_token, COOKIE_NAME as _CN
    good = create_token(user.id, user.token_version or 0)
    client.cookies.set(_CN, good)
    assert client.get("/api/auth/me").status_code == 200

    # Logout bumps token_version; the previously-good token is now stale.
    assert client.post("/api/auth/logout").status_code == 200
    client.cookies.set(_CN, good)
    assert client.get("/api/auth/me").status_code == 401


def test_session_revoked_after_password_reset(client, db, monkeypatch):
    """A reset bumps token_version, so any JWT issued before the reset stops
    validating immediately."""
    monkeypatch.setattr("src.routers.auth.send_password_reset", lambda *a, **k: True, raising=True)

    creds = {"email": "resetrevoke@example.com", "password": "password123", "name": "RR"}
    assert client.post("/api/auth/signup", json=creds).status_code == 200
    user = db.query(User).filter(User.email == "resetrevoke@example.com").first()

    from src.auth.jwt_handler import create_token, COOKIE_NAME as _CN
    good = create_token(user.id, user.token_version or 0)
    client.cookies.set(_CN, good)
    assert client.get("/api/auth/me").status_code == 200

    # Drive a real reset: forge a reset row, then POST /reset-password.
    import hashlib as _h
    from datetime import datetime as _dt, timedelta as _td
    from src.db.models import PasswordReset
    raw_token = "rawtoken-abc123"
    pr = PasswordReset(
        user_id=user.id,
        token_hash=_h.sha256(raw_token.encode()).hexdigest(),
        expires_at=_dt.utcnow() + _td(minutes=30),
    )
    db.add(pr)
    db.commit()

    resp = client.post("/api/auth/reset-password", json={"token": raw_token, "password": "newpass456"})
    assert resp.status_code == 200, resp.text

    # The pre-reset token is now revoked.
    client.cookies.set(_CN, good)
    assert client.get("/api/auth/me").status_code == 401


# ──────────────────────────────────────────────────────────────────────────────
# SEC-04: per-account login lockout
# ──────────────────────────────────────────────────────────────────────────────
def test_account_lockout_after_threshold(client, db):
    """MAX_FAILED_LOGINS consecutive wrong passwords lock the account; further
    attempts (even with the correct password) are rejected with 429."""
    creds = {"email": "lock@example.com", "password": "password123", "name": "Lock"}
    assert client.post("/api/auth/signup", json=creds).status_code == 200
    client.cookies.clear()

    for _ in range(MAX_FAILED_LOGINS):
        # Keep the IP rate-limit (10/min) from tripping so we exercise the
        # ACCOUNT lockout, not slowapi. Reset the per-IP bucket each iteration.
        _reset_limiter_storage()
        r = client.post("/api/auth/login", json={"email": "lock@example.com", "password": "wrong-pw-1"})
        assert r.status_code == 401, r.text

    user = db.query(User).filter(User.email == "lock@example.com").first()
    assert user.locked_until is not None and user.locked_until > datetime.utcnow()

    # Even the correct password is now refused (generic 429, no enumeration).
    _reset_limiter_storage()
    r = client.post("/api/auth/login", json={"email": "lock@example.com", "password": "password123"})
    assert r.status_code == 429
    assert r.json()["detail"] == "Invalid email or password"


def test_successful_login_resets_failed_counter(client, db):
    """A correct login before the lockout threshold clears the failed counter."""
    creds = {"email": "counter@example.com", "password": "password123", "name": "Ctr"}
    assert client.post("/api/auth/signup", json=creds).status_code == 200
    client.cookies.clear()

    # A few failures, but below threshold.
    for _ in range(MAX_FAILED_LOGINS - 1):
        _reset_limiter_storage()
        client.post("/api/auth/login", json={"email": "counter@example.com", "password": "wrong-pw-1"})
    user = db.query(User).filter(User.email == "counter@example.com").first()
    assert user.failed_login_attempts == MAX_FAILED_LOGINS - 1

    # Correct login resets the counter and does not lock.
    _reset_limiter_storage()
    r = client.post("/api/auth/login", json={"email": "counter@example.com", "password": "password123"})
    assert r.status_code == 200, r.text
    db.refresh(user)
    assert user.failed_login_attempts == 0
    assert user.locked_until is None


def test_normal_login_and_me_still_work(client):
    """Sanity: the happy path (signup -> login -> /me) is unaffected."""
    creds = {"email": "normal@example.com", "password": "password123", "name": "Norm"}
    assert client.post("/api/auth/signup", json=creds).status_code == 200
    client.cookies.clear()
    login = client.post("/api/auth/login", json={"email": "normal@example.com", "password": "password123"})
    assert login.status_code == 200, login.text
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "normal@example.com"
