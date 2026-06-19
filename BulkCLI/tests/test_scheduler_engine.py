"""Phase 2b — automation execution engine tests.

THE highest-risk path: an armed run moves real money across accounts unattended.
Everything network-facing is mocked; NO real applies, NO MeroShare, NO network.

Coverage:
  * Auth gate: /api/scheduler/run -> 401 without the right bearer; 503 when
    CRON_SECRET is unset.
  * DRY-RUN (default, not armed): with an active rule + mocked open IPOs +
    accounts, the engine computes intended applies, stamps last_run_at, persists
    `dry_run` rows, and NEVER calls server.apply_single.
  * ARMED + idempotency: AUTOMATION_ARMED + apply_single mocked; applies for a
    fresh (account, company) and SKIPS one already terminal in ApplicationHistory.
  * Caps: max_accounts and max_kitta enforced.

We monkeypatch `server.get_ipos` so we don't have to stub the entire MeroShare
auth + applicableIssue chain — the engine calls it directly with (AccountSelect,
current_user, db). apply_single is monkeypatched so it can never reach network.
"""

import json

import pytest

import server
from src.db.models import (
    User as DBUser,
    MSAccount,
    SchedulerRule,
    ApplicationHistory,
)
from src.auth.crypto import encrypt
from src.routers import scheduler as sched


CRON_SECRET = "test-cron-secret-xyz"


# ── fixtures / helpers ────────────────────────────────────────────────────────
def _make_user(db, email="auto@example.com"):
    u = DBUser(email=email, hashed_password="x", name="Auto")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_account(db, user, username, client_id=1):
    acc = MSAccount(
        user_id=user.id,
        username=username,
        enc_password=encrypt("pw", user.id),
        enc_pin=encrypt("1234", user.id),
        enc_crn=encrypt("CRN", user.id),
        client_id=client_id,
        label=username,
        group_name="Default",
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


def _make_rule(db, user, *, rule_type="auto_all", kitta=10, sectors=None,
               account_ids=None, max_accounts=50, max_kitta=100, active=True):
    cfg = {"kitta": kitta}
    if sectors:
        cfg["sectors"] = sectors
    if account_ids:
        cfg["account_ids"] = account_ids
    rule = SchedulerRule(
        user_id=user.id,
        name="r",
        rule_type=rule_type,
        config_json=json.dumps(cfg),
        active=active,
        max_accounts=max_accounts,
        max_kitta=max_kitta,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def _ipos(*ids):
    return [
        {"companyShareId": cid, "companyName": f"Co{cid}", "scrip": f"S{cid}",
         "shareGroupName": "Ordinary Shares", "shareTypeName": "IPO"}
        for cid in ids
    ]


def _patch_secret(monkeypatch, value=CRON_SECRET):
    if value is None:
        monkeypatch.delenv("CRON_SECRET", raising=False)
    else:
        monkeypatch.setenv("CRON_SECRET", value)


def _bearer(secret=CRON_SECRET):
    return {"Authorization": f"Bearer {secret}"}


# ── AUTH GATE ─────────────────────────────────────────────────────────────────
def test_run_503_when_cron_secret_unset(client, monkeypatch):
    monkeypatch.delenv("CRON_SECRET", raising=False)
    resp = client.post("/api/scheduler/run")
    assert resp.status_code == 503
    assert "disabled" in resp.json()["detail"].lower()


def test_run_401_without_bearer(client, monkeypatch):
    _patch_secret(monkeypatch)
    resp = client.post("/api/scheduler/run")
    assert resp.status_code == 401


def test_run_401_with_wrong_bearer(client, monkeypatch):
    _patch_secret(monkeypatch)
    resp = client.post("/api/scheduler/run", headers=_bearer("nope"))
    assert resp.status_code == 401


def test_run_get_accepted_for_cron(client, db, monkeypatch):
    """Vercel Cron issues GET; the endpoint must accept it (not 405)."""
    _patch_secret(monkeypatch)
    monkeypatch.delenv("AUTOMATION_ARMED", raising=False)
    resp = client.get("/api/scheduler/run", headers=_bearer())
    assert resp.status_code == 200
    assert resp.json()["mode"] == "dry_run"


# ── DRY-RUN (default) ─────────────────────────────────────────────────────────
def test_dry_run_default_computes_intent_and_never_applies(client, db, monkeypatch):
    _patch_secret(monkeypatch)
    monkeypatch.delenv("AUTOMATION_ARMED", raising=False)  # NOT armed -> dry-run

    user = _make_user(db)
    _make_account(db, user, "acctA")
    rule = _make_rule(db, user, rule_type="auto_all", kitta=10)

    monkeypatch.setattr(server, "get_ipos", lambda body, current_user, db: _ipos(101, 102))

    # apply_single must NEVER be called in dry-run. Make it explode if it is.
    def _boom(*a, **k):
        raise AssertionError("apply_single called during DRY-RUN")
    monkeypatch.setattr(server, "apply_single", _boom)

    resp = client.post("/api/scheduler/run", headers=_bearer())
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "dry_run"
    assert body["dry_run"] is True

    rsum = body["summaries"][0]["rules"][0]
    assert rsum["dry_run"] == 2  # 1 account x 2 IPOs
    assert rsum["applied"] == 0

    # dry_run history rows persisted.
    rows = db.query(ApplicationHistory).filter(
        ApplicationHistory.status == "dry_run").all()
    assert len(rows) == 2
    assert {r.company_id for r in rows} == {101, 102}
    assert all(r.kitta == 10 for r in rows)

    # last_run_at stamped.
    db.refresh(rule)
    assert rule.last_run_at is not None


def test_dry_run_param_forces_dry_even_if_armed(client, db, monkeypatch):
    """?dry_run=true must keep a run in dry-run even when AUTOMATION_ARMED=true."""
    _patch_secret(monkeypatch)
    monkeypatch.setenv("AUTOMATION_ARMED", "true")

    user = _make_user(db)
    _make_account(db, user, "acctA")
    _make_rule(db, user, rule_type="auto_all", kitta=10)
    monkeypatch.setattr(server, "get_ipos", lambda body, current_user, db: _ipos(201))
    monkeypatch.setattr(server, "apply_single",
                        lambda *a, **k: (_ for _ in ()).throw(
                            AssertionError("applied despite ?dry_run=true")))

    resp = client.post("/api/scheduler/run?dry_run=true", headers=_bearer())
    assert resp.status_code == 200
    assert resp.json()["mode"] == "dry_run"


# ── ARMED + IDEMPOTENCY ───────────────────────────────────────────────────────
def test_armed_applies_fresh_and_skips_already_done(client, db, monkeypatch):
    _patch_secret(monkeypatch)
    monkeypatch.setenv("AUTOMATION_ARMED", "true")

    user = _make_user(db)
    _make_account(db, user, "acctA")
    _make_rule(db, user, rule_type="auto_all", kitta=10)

    monkeypatch.setattr(server, "get_ipos", lambda body, current_user, db: _ipos(301, 302))

    # company 301 already terminal for acctA -> must be skipped.
    db.add(ApplicationHistory(user_id=user.id, account_username="acctA",
                              company_id=301, kitta=10, status="success"))
    db.commit()

    applied_calls = []

    def _fake_apply(ms_user, company_id, kitta):
        applied_calls.append((ms_user.username, company_id, kitta))
        return {"status": "success", "user_name": ms_user.username,
                "company_id": company_id, "kitta_amount": kitta}

    monkeypatch.setattr(server, "apply_single", _fake_apply)

    resp = client.post("/api/scheduler/run?dry_run=false", headers=_bearer())
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "armed"

    rsum = body["summaries"][0]["rules"][0]
    assert rsum["applied"] == 1
    assert rsum["skipped_idempotent"] == 1
    assert rsum["dry_run"] == 0

    # apply_single called ONLY for the fresh company 302.
    assert applied_calls == [("acctA", 302, 10)]

    # A fresh success row persisted for 302.
    row = db.query(ApplicationHistory).filter(
        ApplicationHistory.company_id == 302,
        ApplicationHistory.status == "success").first()
    assert row is not None


def test_armed_already_applied_status_counted(client, db, monkeypatch):
    _patch_secret(monkeypatch)
    monkeypatch.setenv("AUTOMATION_ARMED", "true")
    user = _make_user(db)
    _make_account(db, user, "acctA")
    _make_rule(db, user, rule_type="auto_all", kitta=10)
    monkeypatch.setattr(server, "get_ipos", lambda body, current_user, db: _ipos(401))
    monkeypatch.setattr(server, "apply_single",
                        lambda u, c, k: {"status": "already_applied",
                                         "user_name": u.username})
    resp = client.post("/api/scheduler/run?dry_run=false", headers=_bearer())
    rsum = resp.json()["summaries"][0]["rules"][0]
    assert rsum["already"] == 1
    assert rsum["applied"] == 0


# ── CAPS ──────────────────────────────────────────────────────────────────────
def test_max_accounts_cap_enforced(client, db, monkeypatch):
    _patch_secret(monkeypatch)
    monkeypatch.setenv("AUTOMATION_ARMED", "true")
    user = _make_user(db)
    for n in range(5):
        _make_account(db, user, f"acct{n}")
    _make_rule(db, user, rule_type="auto_all", kitta=10, max_accounts=2)
    monkeypatch.setattr(server, "get_ipos", lambda body, current_user, db: _ipos(501))

    seen = []
    monkeypatch.setattr(server, "apply_single",
                        lambda u, c, k: (seen.append(u.username) or
                                         {"status": "success", "user_name": u.username}))
    resp = client.post("/api/scheduler/run?dry_run=false", headers=_bearer())
    rsum = resp.json()["summaries"][0]["rules"][0]
    # Only 2 accounts processed despite 5 existing.
    assert rsum["applied"] == 2
    assert len(seen) == 2


def test_max_kitta_cap_clamps_applied_kitta(client, db, monkeypatch):
    _patch_secret(monkeypatch)
    monkeypatch.setenv("AUTOMATION_ARMED", "true")
    user = _make_user(db)
    _make_account(db, user, "acctA")
    # rule wants 999 kitta but cap is 25 -> engine must apply 25.
    _make_rule(db, user, rule_type="auto_all", kitta=999, max_kitta=25)
    monkeypatch.setattr(server, "get_ipos", lambda body, current_user, db: _ipos(601))

    captured = {}
    monkeypatch.setattr(server, "apply_single",
                        lambda u, c, k: (captured.update(kitta=k) or
                                         {"status": "success", "user_name": u.username}))
    resp = client.post("/api/scheduler/run?dry_run=false", headers=_bearer())
    assert resp.status_code == 200
    assert captured["kitta"] == 25


def test_sector_filter_with_no_sectors_matches_nothing(client, db, monkeypatch):
    """A sector_filter rule with no configured sectors must match NO IPOs (never
    fall open to all)."""
    _patch_secret(monkeypatch)
    monkeypatch.delenv("AUTOMATION_ARMED", raising=False)
    user = _make_user(db)
    _make_account(db, user, "acctA")
    _make_rule(db, user, rule_type="sector_filter", kitta=10, sectors=None)
    monkeypatch.setattr(server, "get_ipos", lambda body, current_user, db: _ipos(701, 702))
    resp = client.post("/api/scheduler/run", headers=_bearer())
    rsum = resp.json()["summaries"][0]["rules"][0]
    assert rsum["dry_run"] == 0
