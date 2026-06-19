"""Apply-path test suite (TARGET-3) — Phase 2a.

Covers:
  * ApplicationService._prepare_application_data — bank shapes (None / list / dict),
    customer_code shapes (dict / list), and failure inputs -> None.
  * server.apply_single — success on HTTP 200; success on a real success message
    at a non-200; the distinct `already_applied` status; failure surfaces an
    error; transactionPIN coerced to str.
  * POST /api/apply/multi end-to-end via authed_client — NDJSON start/progress/
    complete events, unknown account -> 'Account not found', AND ApplicationHistory
    rows persisted with the right statuses (incl. already_applied).
  * POST /api/ipos — a non-200 upstream (after auth) -> HTTP 502.

All outbound MeroShare / network is mocked: apply_single's MeroShareClient is
monkeypatched, and server.req_lib (the `requests` alias) is stubbed via the
mock_meroshare fixture's guard.set_response(...).
"""

import json

import pytest

import server
from src.models.user import User
from src.services.application_service import ApplicationService
from src.db.models import ApplicationHistory
from src.auth.session import CSRF_COOKIE
from tests.conftest import FakeResponse, FakeMeroShareClient


# ── helpers ─────────────────────────────────────────────────────────────────
def _user() -> User:
    return User(client_id=1, username="msuser1", password="pw", crn="CRN001", pin=1234)


class _FakeClient:
    """A controllable MeroShareClient stand-in for _prepare_application_data."""

    def __init__(self, *, bank_list=None, bank_detail=None, customer_code=None):
        self._bank_list = bank_list
        self._bank_detail = bank_detail
        self._customer_code = customer_code

    def get_bank_list(self, token):
        return self._bank_list

    def get_bank_detail(self, token, bank_id):
        return self._bank_detail

    def _make_authenticated_request(self, endpoint, token, method="GET"):
        return self._customer_code


def _personal():
    return {"demat": "demat-123", "boid": "boid-123"}


def _boid():
    return {"boid": "boid-456", "bankCode": "BANK1"}


# ──────────────────────────────────────────────────────────────────────────────
# UNIT: _prepare_application_data
# ──────────────────────────────────────────────────────────────────────────────
def test_prepare_bank_details_none_happy_path():
    """bank_details=None falls back to bank_list[0] + bank_detail; builds data."""
    svc = ApplicationService()
    svc.client = _FakeClient(
        bank_list=[{"id": 99}],
        bank_detail={"accountBranchId": 5, "accountNumber": "ACC1",
                     "accountTypeId": 2, "id": 7},
    )
    data = svc._prepare_application_data(
        _user(), _personal(), _boid(), None, company_id=123, kitta_amount=10, token="t"
    )
    assert data is not None
    assert data["companyShareId"] == 123
    assert data["appliedKitta"] == 10
    assert data["bankId"] == 99  # injected because bank_detail lacked bankId
    assert data["customerId"] == 7
    assert data["boid"] == "boid-123"  # personal_details["boid"]


def test_prepare_bank_info_as_list():
    """bank_details['bank'] as a LIST -> first element's id is the bankId."""
    svc = ApplicationService()
    svc.client = _FakeClient(customer_code={"id": 555})
    bank_details = {
        "bank": [{"id": 11}],
        "branch": {"id": 22},
        "accountNumber": "ACC9",
        "accountTypeId": 1,
    }
    data = svc._prepare_application_data(
        _user(), _personal(), _boid(), bank_details, 200, 20, "t"
    )
    assert data["bankId"] == 11
    assert data["accountBranchId"] == 22
    assert data["customerId"] == 555


def test_prepare_bank_info_as_dict():
    """bank_details['bank'] as a DICT -> its id is the bankId."""
    svc = ApplicationService()
    svc.client = _FakeClient(customer_code={"id": 777})
    bank_details = {
        "bank": {"id": 33},
        "branch": [{"id": 44}],  # branch as a list too
        "accountNumber": "ACC8",
    }
    data = svc._prepare_application_data(
        _user(), _personal(), _boid(), bank_details, 300, 30, "t"
    )
    assert data["bankId"] == 33
    assert data["accountBranchId"] == 44
    assert data["customerId"] == 777
    assert data["accountTypeId"] == 1  # defaulted when absent


def test_prepare_customer_code_as_list():
    """customer_code returned as a LIST -> customerId comes from [0]['id']."""
    svc = ApplicationService()
    svc.client = _FakeClient(customer_code=[{"id": 888}])
    bank_details = {"bank": {"id": 1}, "branch": {"id": 2}, "accountNumber": "A"}
    data = svc._prepare_application_data(
        _user(), _personal(), _boid(), bank_details, 1, 1, "t"
    )
    assert data["customerId"] == 888


def test_prepare_returns_none_when_no_banks():
    """bank_details=None and an empty bank_list -> None (cannot proceed)."""
    svc = ApplicationService()
    svc.client = _FakeClient(bank_list=[])
    data = svc._prepare_application_data(
        _user(), _personal(), _boid(), None, 1, 1, "t"
    )
    assert data is None


def test_prepare_returns_none_when_no_customer_code():
    """A dict bank_details whose customer_code lookup fails -> None."""
    svc = ApplicationService()
    svc.client = _FakeClient(customer_code=None)
    bank_details = {"bank": {"id": 1}, "branch": {"id": 2}, "accountNumber": "A"}
    data = svc._prepare_application_data(
        _user(), _personal(), _boid(), bank_details, 1, 1, "t"
    )
    assert data is None


# ──────────────────────────────────────────────────────────────────────────────
# UNIT: apply_single  (MeroShareClient + req_lib.post mocked)
# ──────────────────────────────────────────────────────────────────────────────
class _ApplyReadyClient(FakeMeroShareClient):
    """A fake client whose pre-apply lookups all succeed, so apply_single reaches
    the direct req_lib.post and _prepare_application_data returns usable data
    (dict bank path)."""

    def authenticate(self, user):
        return "token-abc"

    def get_personal_details(self, token):
        return {"demat": "demat-123", "boid": "boid-123"}

    def get_client_boid_details(self, token, demat):
        return {"boid": "boid-456", "bankCode": "BANK1"}

    def get_bank_details(self, token, bank_code):
        return {"bank": {"id": 1}, "branch": {"id": 2}, "accountNumber": "ACC1"}

    def _make_authenticated_request(self, *args, **kwargs):
        return {"id": 7}  # customer_code


def _patch_apply_client(monkeypatch):
    """Make every MeroShareClient resolve to the apply-ready fake (both the lazy
    import in apply_single and the one ApplicationService captured at import)."""
    monkeypatch.setattr(
        "src.api.meroshare_client.MeroShareClient", _ApplyReadyClient, raising=True
    )
    monkeypatch.setattr(
        "src.services.application_service.MeroShareClient", _ApplyReadyClient, raising=True
    )


def test_apply_single_success_on_http_200(monkeypatch):
    _patch_apply_client(monkeypatch)
    captured = {}

    def _post(url, json=None, headers=None, timeout=None):
        captured["json"] = json
        return FakeResponse(200, {"message": "Applied successfully"})

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)
    result = server.apply_single(_user(), company_id=123, kitta=10)
    assert result["status"] == "success"
    # transactionPIN must be coerced to a string before the POST.
    assert captured["json"]["transactionPIN"] == "1234"
    assert isinstance(captured["json"]["transactionPIN"], str)


def test_apply_single_success_message_on_non_200(monkeypatch):
    """A non-200 whose body carries a genuine success message still -> success."""
    _patch_apply_client(monkeypatch)

    def _post(url, json=None, headers=None, timeout=None):
        return FakeResponse(409, {"message": "Share has been applied"})

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)
    result = server.apply_single(_user(), 123, 10)
    assert result["status"] == "success"


def test_apply_single_already_applied(monkeypatch):
    """Upstream says the account already applied -> distinct `already_applied`."""
    _patch_apply_client(monkeypatch)

    def _post(url, json=None, headers=None, timeout=None):
        return FakeResponse(400, {"message": "You have already applied for this issue"})

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)
    result = server.apply_single(_user(), 123, 10)
    assert result["status"] == "already_applied"


def test_apply_single_failure_surfaces_error(monkeypatch):
    """A genuine upstream failure -> failed with the upstream message surfaced."""
    _patch_apply_client(monkeypatch)

    def _post(url, json=None, headers=None, timeout=None):
        return FakeResponse(400, {"message": "Insufficient balance"})

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)
    result = server.apply_single(_user(), 123, 10)
    assert result["status"] == "failed"
    assert result["error_message"] == "Insufficient balance"


def test_apply_single_auth_failure(monkeypatch):
    """No token from authenticate -> failed, and no POST attempted."""
    monkeypatch.setattr(
        "src.api.meroshare_client.MeroShareClient", FakeMeroShareClient, raising=True
    )
    result = server.apply_single(_user(), 123, 10)
    assert result["status"] == "failed"
    assert result["error_message"] == "Authentication failed"


# ──────────────────────────────────────────────────────────────────────────────
# INTEGRATION: POST /api/apply/multi  (NDJSON stream + history persistence)
# ──────────────────────────────────────────────────────────────────────────────
def _create_account(authed_client, username="msuser1", client_id=1):
    body = {
        "username": username, "password": "secret-pw", "pin": "1234",
        "crn": "CRN001", "client_id": client_id, "label": username,
        "group_name": "Default",
    }
    resp = authed_client.post("/api/accounts", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _parse_ndjson(text):
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def test_apply_multi_streams_and_persists_history(authed_client, db, monkeypatch):
    """End-to-end: a real account allocation streams start/progress/complete and
    persists an ApplicationHistory row. A second allocation that comes back
    `already_applied` is persisted with that distinct status. An unknown
    account_id streams an 'Account not found' failure (also persisted)."""
    _patch_apply_client(monkeypatch)

    # apply_single's direct POST: first call -> success, later -> already_applied.
    calls = {"n": 0}

    def _post(url, json=None, headers=None, timeout=None):
        if url.endswith("/applicantForm/share/apply/"):
            calls["n"] += 1
            if calls["n"] == 1:
                return FakeResponse(200, {"message": "Applied successfully"})
            return FakeResponse(400, {"message": "You have already applied"})
        raise AssertionError(f"unexpected POST {url}")

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)

    acc_id = _create_account(authed_client)

    req = {
        "allocations": [
            {"account_id": acc_id, "company_id": 111, "kitta": 10,
             "company_name": "Alpha Ltd", "scrip": "ALPHA"},
            {"account_id": acc_id, "company_id": 222, "kitta": 20,
             "company_name": "Beta Ltd", "scrip": "BETA"},
            {"account_id": 999999, "company_id": 333, "kitta": 30},  # unknown acct
        ]
    }
    resp = authed_client.post("/api/apply/multi", json=req)
    assert resp.status_code == 200, resp.text
    events = _parse_ndjson(resp.text)

    types = [e["type"] for e in events]
    assert types[0] == "start"
    assert types[-1] == "complete"
    assert types.count("progress") == 3

    statuses = [e["result"]["status"] for e in events if e["type"] == "progress"]
    assert statuses == ["success", "already_applied", "failed"]
    # The unknown-account event carries an 'Account not found' error.
    not_found = events[3]["result"]
    assert not_found["status"] == "failed"
    assert not_found["error_message"] == "Account not found"

    # History persisted for all three.
    rows = db.query(ApplicationHistory).order_by(ApplicationHistory.company_id).all()
    assert len(rows) == 3
    by_company = {r.company_id: r for r in rows}
    assert by_company[111].status == "success"
    assert by_company[111].company_name == "Alpha Ltd"
    assert by_company[111].scrip == "ALPHA"
    assert by_company[111].kitta == 10
    assert by_company[222].status == "already_applied"
    assert by_company[333].status == "failed"
    assert by_company[333].error_message == "Account not found"


def test_apply_multi_history_visible_via_history_endpoints(authed_client, db, monkeypatch):
    """After applying, the four history endpoints return real data."""
    _patch_apply_client(monkeypatch)

    def _post(url, json=None, headers=None, timeout=None):
        if url.endswith("/applicantForm/share/apply/"):
            return FakeResponse(200, {"message": "Applied successfully"})
        raise AssertionError(f"unexpected POST {url}")

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)
    acc_id = _create_account(authed_client)

    req = {"allocations": [
        {"account_id": acc_id, "company_id": 111, "kitta": 10,
         "company_name": "Alpha Ltd", "scrip": "ALPHA"},
    ]}
    assert authed_client.post("/api/apply/multi", json=req).status_code == 200

    listed = authed_client.get("/api/history")
    assert listed.status_code == 200
    payload = listed.json()
    assert payload["total"] == 1
    assert payload["rows"][0]["company_name"] == "Alpha Ltd"
    assert payload["rows"][0]["status"] == "success"

    stats = authed_client.get("/api/history/stats").json()
    assert stats["total_applications"] == 1
    assert stats["success"] == 1

    applied = authed_client.get("/api/history/applied-ipos").json()
    assert len(applied) == 1
    assert applied[0]["company_id"] == 111
    assert applied[0]["accounts"]["msuser1"] == "success"


def test_apply_multi_history_write_failure_does_not_break_stream(
    authed_client, monkeypatch
):
    """A DB error while writing history must be swallowed: the stream still
    completes and the progress event is still emitted."""
    _patch_apply_client(monkeypatch)

    def _post(url, json=None, headers=None, timeout=None):
        if url.endswith("/applicantForm/share/apply/"):
            return FakeResponse(200, {"message": "Applied successfully"})
        raise AssertionError(f"unexpected POST {url}")

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated DB failure")

    monkeypatch.setattr(server.ApplicationHistory, "__init__", _boom, raising=False)

    acc_id = _create_account(authed_client)
    req = {"allocations": [
        {"account_id": acc_id, "company_id": 111, "kitta": 10},
    ]}
    resp = authed_client.post("/api/apply/multi", json=req)
    assert resp.status_code == 200
    events = _parse_ndjson(resp.text)
    assert events[-1]["type"] == "complete"
    assert any(
        e["type"] == "progress" and e["result"]["status"] == "success"
        for e in events
    )


# ──────────────────────────────────────────────────────────────────────────────
# INTEGRATION: POST /api/ipos  (F8 — non-200 upstream after auth -> 502)
# ──────────────────────────────────────────────────────────────────────────────
def test_get_ipos_upstream_error_is_502(authed_client, monkeypatch):
    """Auth succeeds but applicableIssue returns non-200 -> HTTP 502 (not [])."""
    _create_account(authed_client)

    def _post(url, json=None, headers=None, timeout=None):
        if url.endswith("/meroShare/auth/"):
            return FakeResponse(200, {}, headers={"Authorization": "tok-123"})
        if url.endswith("/applicableIssue/"):
            return FakeResponse(503, {}, text="upstream down")
        raise AssertionError(f"unexpected POST {url}")

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)
    resp = authed_client.post("/api/ipos", json={})
    assert resp.status_code == 502, resp.text


def test_get_ipos_happy_path_returns_issues(authed_client, monkeypatch):
    """Auth succeeds and applicableIssue returns a 200 page -> issues list."""
    _create_account(authed_client)

    def _post(url, json=None, headers=None, timeout=None):
        if url.endswith("/meroShare/auth/"):
            return FakeResponse(200, {}, headers={"Authorization": "tok-123"})
        if url.endswith("/applicableIssue/"):
            return FakeResponse(200, {"object": [
                {"companyShareId": 5, "companyName": "Gamma", "scrip": "GAMMA"},
            ]})
        raise AssertionError(f"unexpected POST {url}")

    monkeypatch.setattr(server.req_lib, "post", _post, raising=False)
    resp = authed_client.post("/api/ipos", json={})
    assert resp.status_code == 200, resp.text
    issues = resp.json()
    assert len(issues) == 1
    assert issues[0]["companyShareId"] == 5
    assert issues[0]["scrip"] == "GAMMA"
