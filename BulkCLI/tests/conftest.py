"""Pytest harness for the Hissa FastAPI backend.

Design goals (per REC-STACK):
  * Hermetic: in-memory SQLite, no live network, no live MeroShare, no Postgres.
  * Same import path as production: `server` exposes `app`; `get_db` from
    `src.db.database` is overridden to hand tests a transactional session.
  * Cookie + double-submit-CSRF auth handled for you via `authed_client`.

IMPORTANT ordering: the env vars below are set BEFORE any `src.*` / `server`
import so that `src.config.security` (which reads JWT_SECRET / ENCRYPTION_KEY at
import time and fail-closes in prod) sees a dev configuration:
  * JWT_SECRET / ENCRYPTION_KEY -> fixed test values (no insecure-default warning).
  * APP_ENV=dev                 -> forces IS_PROD = False even if a stray
                                   DATABASE_URL leaks into the environment.
  * DATABASE_URL is popped       -> SQLite fallback + dev mode.
"""

import os
import sys
from pathlib import Path

# ── 0. Environment must be configured before importing the app under test ──────
_BULKCLI = Path(__file__).resolve().parent.parent  # .../BulkCLI
if str(_BULKCLI) not in sys.path:
    sys.path.insert(0, str(_BULKCLI))

os.environ["JWT_SECRET"] = "test-jwt-secret-do-not-use-in-prod-0123456789"
os.environ["ENCRYPTION_KEY"] = "test-encryption-key-do-not-use-in-prod-0123456789"
os.environ["APP_ENV"] = "dev"
# Belt-and-suspenders: even with APP_ENV=dev forcing dev mode, drop DATABASE_URL
# so src.db.database falls back to SQLite and never tries a real Postgres.
os.environ.pop("DATABASE_URL", None)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Importing server pulls in the whole app graph (routers, auth, db, config).
import server  # noqa: E402  -- must come after the env setup above
from src.db.database import Base, get_db  # noqa: E402
from src.db import models as db_models  # noqa: E402,F401  (registers tables on Base)
from src.auth.session import CSRF_COOKIE, CSRF_HEADER  # noqa: E402
from src.auth.jwt_handler import COOKIE_NAME  # noqa: E402

app = server.app


# ── 1. In-memory SQLite engine shared across the whole test session ────────────
# StaticPool + a single shared :memory: connection means every Session sees the
# same database (a plain sqlite:///:memory: would give each connection its own
# empty DB). check_same_thread=False lets the TestClient's threadpool reuse it.
@pytest.fixture(scope="session")
def engine():
    eng = create_engine(
        "sqlite://",  # in-memory
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture(scope="session")
def _SessionFactory(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── 2. Function-scoped DB session with a clean slate per test ──────────────────
@pytest.fixture
def db(engine, _SessionFactory):
    """A SQLAlchemy Session for direct use in tests.

    Tables are truncated before each test so suites stay isolated without paying
    to recreate the schema every time.
    """
    for table in reversed(Base.metadata.sorted_tables):
        with engine.begin() as conn:
            conn.execute(table.delete())
    session = _SessionFactory()
    try:
        yield session
    finally:
        session.close()


# ── 3. TestClient bound to the app, with get_db overridden ─────────────────────
@pytest.fixture
def client(db):
    """A TestClient whose `get_db` dependency yields the test session.

    The override is keyed on the *same* `get_db` callable object that server.py
    and every router imported, so FastAPI matches it for all endpoints.

    NB: we deliberately do NOT use TestClient as a context manager — that would
    fire the app's @on_event("startup") init_db(), which builds tables on the
    real (file) engine. We create tables ourselves on the in-memory engine.
    """

    def _override_get_db():
        try:
            yield db
        finally:
            pass  # session lifecycle owned by the `db` fixture

    app.dependency_overrides[get_db] = _override_get_db
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


# ── 4. Authenticated client (cookie session + double-submit CSRF) ──────────────
# Default test credentials; override per-test by passing kwargs to the factory.
DEFAULT_EMAIL = "tester@example.com"
DEFAULT_PASSWORD = "password123"  # satisfies _validate_password (>=8, alpha+digit)
DEFAULT_NAME = "Test User"


class CSRFClient:
    """Thin wrapper over TestClient that auto-attaches the double-submit CSRF
    header (the `hissa_csrf` cookie value echoed into `X-CSRF-Token`) on every
    mutating request, mirroring what the real frontend does. The session +
    csrf cookies live in the wrapped client's cookie jar after login.
    """

    _MUTATING = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, client: TestClient):
        self._c = client

    @property
    def cookies(self):
        return self._c.cookies

    def _with_csrf(self, method: str, kwargs: dict) -> dict:
        if method.upper() in self._MUTATING:
            csrf = self._c.cookies.get(CSRF_COOKIE)
            if csrf:
                headers = dict(kwargs.get("headers") or {})
                # Header name is case-insensitive; CSRF_HEADER is "x-csrf-token".
                headers.setdefault(CSRF_HEADER, csrf)
                kwargs["headers"] = headers
        return kwargs

    def request(self, method: str, url: str, **kwargs):
        return self._c.request(method, url, **self._with_csrf(method, kwargs))

    def get(self, url, **kwargs):
        return self._c.get(url, **kwargs)

    def post(self, url, **kwargs):
        return self._c.request("POST", url, **self._with_csrf("POST", kwargs))

    def put(self, url, **kwargs):
        return self._c.request("PUT", url, **self._with_csrf("PUT", kwargs))

    def patch(self, url, **kwargs):
        return self._c.request("PATCH", url, **self._with_csrf("PATCH", kwargs))

    def delete(self, url, **kwargs):
        return self._c.request("DELETE", url, **self._with_csrf("DELETE", kwargs))


@pytest.fixture
def auth_credentials():
    """The credentials `authed_client` signs up / logs in with. Override in a
    test module via fixture parametrization if you need a different user."""
    return {"email": DEFAULT_EMAIL, "password": DEFAULT_PASSWORD, "name": DEFAULT_NAME}


@pytest.fixture
def authed_client(client, auth_credentials):
    """A logged-in CSRFClient.

    Signs up (POST /api/auth/signup) then logs in (POST /api/auth/login) so the
    session (`hissa_session`, httpOnly) and CSRF (`hissa_csrf`) cookies are set
    on the underlying TestClient's cookie jar. Mutating requests made through
    this client automatically carry the X-CSRF-Token header.
    """
    signup = client.post("/api/auth/signup", json=auth_credentials)
    assert signup.status_code == 200, f"signup failed: {signup.status_code} {signup.text}"
    login = client.post(
        "/api/auth/login",
        json={"email": auth_credentials["email"], "password": auth_credentials["password"]},
    )
    assert login.status_code == 200, f"login failed: {login.status_code} {login.text}"
    assert client.cookies.get(COOKIE_NAME), "session cookie not set after login"
    assert client.cookies.get(CSRF_COOKIE), "csrf cookie not set after login"
    return CSRFClient(client)


# ── 5. Network / MeroShare neutralization ──────────────────────────────────────
class FakeResponse:
    """Minimal stand-in for requests.Response used by server.py helpers."""

    def __init__(self, status_code=200, json_data=None, headers=None, text=""):
        self.status_code = status_code
        self._json = {} if json_data is None else json_data
        self.headers = headers or {}
        self.text = text or ""

    def json(self):
        return self._json


class FakeMeroShareClient:
    """Drop-in for src.api.meroshare_client.MeroShareClient that never touches
    the network. By default authentication fails (returns no token) so apply
    flows resolve deterministically without hitting MeroShare. Tests that want a
    successful apply can monkeypatch individual methods on the instance/class.
    """

    def __init__(self, *args, **kwargs):
        pass

    def authenticate(self, user):
        return None  # default: no token -> apply marks "Authentication failed"

    def get_personal_details(self, token):
        return None

    def get_client_boid_details(self, token, demat):
        return None

    def get_bank_details(self, token, bank_code):
        return None

    def get_bank_list(self, token):
        return None

    def get_bank_detail(self, token, bank_id):
        return None

    def apply_ipo(self, token, application_data):
        return None

    def _make_authenticated_request(self, *args, **kwargs):
        return None


@pytest.fixture
def mock_meroshare(monkeypatch):
    """Block ALL live network used by the apply / snapshot / report flows.

    Patches:
      * server.req_lib  -> the `requests` alias used directly in server.py
        (auth(), apply_single(), snapshot/portfolio/ipos/reports). Any call
        raises so a test that forgets to stub a path fails loudly instead of
        silently reaching the internet.
      * src.api.meroshare_client.MeroShareClient -> FakeMeroShareClient. This is
        the class server.apply_single() imports lazily AND the one
        application_service.py instantiates, so both resolve to the fake.

    Returns a small namespace so tests can swap in their own behavior, e.g.:
        mock_meroshare.set_response(lambda url, **kw: FakeResponse(200, {...}))
        mock_meroshare.client_cls = MyCustomFakeClient
    """
    import requests as _requests

    class _Guard:
        """Raises on any unexpected HTTP call; tests opt into responses."""

        def __init__(self):
            self._handler = None

        def set_response(self, handler):
            """handler(method, url, **kwargs) -> FakeResponse"""
            self._handler = handler

        def _call(self, method, url, **kwargs):
            if self._handler is None:
                raise AssertionError(
                    f"Unexpected live HTTP {method} {url} during test. "
                    "Stub it via mock_meroshare.set_response(...)."
                )
            return self._handler(method, url, **kwargs)

        def get(self, url, **kwargs):
            return self._call("GET", url, **kwargs)

        def post(self, url, **kwargs):
            return self._call("POST", url, **kwargs)

        # Mirror the `requests` module surface server.py might touch.
        Session = _requests.Session
        RequestException = _requests.RequestException

    guard = _Guard()
    monkeypatch.setattr(server, "req_lib", guard, raising=True)
    monkeypatch.setattr(
        "src.api.meroshare_client.MeroShareClient", FakeMeroShareClient, raising=True
    )
    # Expose knobs for tests.
    guard.FakeResponse = FakeResponse
    guard.client_cls = FakeMeroShareClient
    return guard
