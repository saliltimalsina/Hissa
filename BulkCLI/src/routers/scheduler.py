import os
import json
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User, SchedulerRule, MSAccount, ApplicationHistory
from src.auth.jwt_handler import get_current_user
from src.auth.session import require_csrf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])

# ── Phase 2b automation engine: hard safety defaults ──────────────────────────
# Per-rule caps used when a rule predates the columns / has no explicit value.
DEFAULT_MAX_ACCOUNTS = 50
DEFAULT_MAX_KITTA = 100


class RuleIn(BaseModel):
    name: str
    rule_type: str  # auto_all | sector_filter
    kitta: int = 10
    sectors: Optional[List[str]] = None
    account_ids: Optional[List[int]] = None  # None = all accounts
    max_accounts: int = DEFAULT_MAX_ACCOUNTS
    max_kitta: int = DEFAULT_MAX_KITTA


class RuleOut(BaseModel):
    id: int
    name: str
    rule_type: str
    kitta: int
    sectors: Optional[List[str]]
    account_ids: Optional[List[int]]
    active: bool
    last_run_at: Optional[str]
    created_at: str
    max_accounts: int
    max_kitta: int


def _to_out(rule: SchedulerRule) -> dict:
    cfg = json.loads(rule.config_json)
    return {
        "id": rule.id,
        "name": rule.name,
        "rule_type": rule.rule_type,
        "kitta": cfg.get("kitta", 10),
        "sectors": cfg.get("sectors"),
        "account_ids": cfg.get("account_ids"),
        "active": rule.active,
        "last_run_at": rule.last_run_at.isoformat() if rule.last_run_at else None,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "max_accounts": rule.max_accounts if rule.max_accounts is not None else DEFAULT_MAX_ACCOUNTS,
        "max_kitta": rule.max_kitta if rule.max_kitta is not None else DEFAULT_MAX_KITTA,
    }


@router.get("/rules")
def list_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rules = db.query(SchedulerRule).filter(SchedulerRule.user_id == current_user.id).all()
    return [_to_out(r) for r in rules]


@router.post("/rules")
def create_rule(
    body: RuleIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    if body.rule_type not in ("auto_all", "sector_filter"):
        raise HTTPException(400, "rule_type must be auto_all or sector_filter")
    cfg = {"kitta": body.kitta}
    if body.sectors:
        cfg["sectors"] = body.sectors
    if body.account_ids:
        cfg["account_ids"] = body.account_ids
    rule = SchedulerRule(
        user_id=current_user.id,
        name=body.name,
        rule_type=body.rule_type,
        config_json=json.dumps(cfg),
        active=True,
        max_accounts=max(0, body.max_accounts),
        max_kitta=max(0, body.max_kitta),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _to_out(rule)


@router.put("/rules/{rule_id}/toggle")
def toggle_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    rule = db.query(SchedulerRule).filter(
        SchedulerRule.id == rule_id,
        SchedulerRule.user_id == current_user.id,
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.active = not rule.active
    db.commit()
    return _to_out(rule)


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    rule = db.query(SchedulerRule).filter(
        SchedulerRule.id == rule_id,
        SchedulerRule.user_id == current_user.id,
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Phase 2b — AUTOMATION EXECUTION ENGINE
# ══════════════════════════════════════════════════════════════════════════════
#
# THIS IS THE HIGHEST-RISK CODE IN THE PROJECT. When armed it can apply to IPOs
# (move real money) across many accounts with no human in the loop. Read the
# safety model before touching anything below.
#
# SAFETY MODEL — three independent gates, ALL must allow before money moves:
#
#   1) AUTHENTICATION (CRON_SECRET): POST /api/scheduler/run is NOT behind the
#      user cookie/CSRF auth. It requires `Authorization: Bearer <CRON_SECRET>`.
#      Vercel Cron automatically sends this header when the CRON_SECRET env var is
#      set on the project. Wrong/missing header -> 401. If CRON_SECRET is UNSET
#      the engine is DISABLED entirely -> 503 (we NEVER run unauthenticated).
#
#   2) ARMING (AUTOMATION_ARMED): real applies only happen when the env var
#      AUTOMATION_ARMED is true/1/yes. This is the master kill-switch. When NOT
#      armed (the DEFAULT), the engine runs in DRY-RUN: it computes EXACTLY what
#      it would apply (user/account/company/kitta), records `dry_run` intent rows,
#      stamps last_run_at, and returns a full summary — but it NEVER calls
#      apply_single and NEVER touches MeroShare.
#
#   3) DRY-RUN OVERRIDE (?dry_run=): a request may force dry-run via the query
#      param (?dry_run=true). The param can only ever make a run SAFER. It can
#      NEVER turn a real apply on: if AUTOMATION_ARMED is false, the run is
#      dry-run no matter what the param says. Only `dry_run=false` AND armed
#      produces real applies.
#
#   armed = AUTOMATION_ARMED is truthy
#   dry_run_param defaults True; ?dry_run=false sets it False
#   REAL APPLIES  <=>  armed AND (dry_run_param is False)
#   everything else  ->  DRY-RUN
#
# Per-rule caps (max_accounts, max_kitta) bound blast radius even when armed.
# Idempotency (ApplicationHistory) prevents double-applying the same company on
# the same account across runs.

# History statuses that mean "this (account, company) is already done" — never
# re-apply over any of these. (dry_run rows are NOT terminal: a dry-run never
# actually applied, so a later armed run must still be free to apply.)
_TERMINAL_STATUSES = ("success", "already_applied", "allotted", "not_allotted")


def _truthy(val: Optional[str]) -> bool:
    return (val or "").strip().lower() in ("1", "true", "yes", "on")


def _rule_kitta(rule: SchedulerRule) -> int:
    try:
        return int(json.loads(rule.config_json).get("kitta", 10))
    except Exception:
        return 10


def _rule_sectors(rule: SchedulerRule) -> Optional[List[str]]:
    try:
        secs = json.loads(rule.config_json).get("sectors")
        return [str(s).strip().lower() for s in secs] if secs else None
    except Exception:
        return None


def _rule_account_ids(rule: SchedulerRule) -> Optional[List[int]]:
    try:
        return json.loads(rule.config_json).get("account_ids")
    except Exception:
        return None


def _ipo_matches_rule(ipo: dict, rule: SchedulerRule) -> bool:
    """auto_all matches every open IPO; sector_filter matches when the IPO's
    share group / type sits in the rule's configured sectors. The MeroShare feed
    exposes no explicit 'sector', so we match on shareGroupName / shareTypeName /
    scrip (case-insensitive substring) — conservative: no sectors configured on a
    sector_filter rule means it matches NOTHING (never falls open to all)."""
    if rule.rule_type == "auto_all":
        return True
    if rule.rule_type == "sector_filter":
        wanted = _rule_sectors(rule)
        if not wanted:
            return False
        haystack = " ".join(str(ipo.get(k, "")) for k in
                            ("shareGroupName", "shareTypeName", "companyName", "scrip")).lower()
        return any(w in haystack for w in wanted)
    return False


def _already_done(db: Session, user_id: int, account_username: str, company_id: int) -> bool:
    """Idempotency guard: True if this (user, account, company) already has a
    terminal ApplicationHistory row, so the engine must skip it."""
    row = (
        db.query(ApplicationHistory)
        .filter(
            ApplicationHistory.user_id == user_id,
            ApplicationHistory.account_username == account_username,
            ApplicationHistory.company_id == company_id,
            ApplicationHistory.status.in_(_TERMINAL_STATUSES),
        )
        .first()
    )
    return row is not None


def _run_engine_for_user(db: Session, db_user: User, *, armed: bool, dry_run: bool) -> dict:
    """Execute all active rules for one user. Returns a per-rule summary dict.

    `armed and not dry_run` is the ONLY combination that calls apply_single. Every
    other combination computes intent and records `dry_run` rows instead.
    """
    # Lazy import to avoid a circular import at module load (server imports this
    # router). server holds the apply path + the MeroShare-facing helpers.
    import server

    rules = (
        db.query(SchedulerRule)
        .filter(SchedulerRule.user_id == db_user.id, SchedulerRule.active.is_(True))
        .all()
    )
    out = {"user_id": db_user.id, "rules": []}
    if not rules:
        return out

    # Account map (id + username) for resolving rule.account_ids and idempotency.
    user_accounts = db.query(MSAccount).filter(MSAccount.user_id == db_user.id).all()
    if not user_accounts:
        for rule in rules:
            rule.last_run_at = datetime.utcnow()
            out["rules"].append({"rule_id": rule.id, "name": rule.name,
                                 "applied": 0, "already": 0, "skipped_idempotent": 0,
                                 "dry_run": 0, "failed": 0, "note": "no accounts"})
        db.commit()
        return out

    # Open IPOs for this user. get_ipos is request-scoped (Depends), so call the
    # underlying logic directly: load decrypted accounts and reuse server.get_ipos
    # via its dependency-free internals. We invoke the route function with the
    # already-resolved user/db (FastAPI deps are plain kwargs when called direct).
    try:
        open_ipos = server.get_ipos(server.AccountSelect(), current_user=db_user, db=db)
    except HTTPException as e:
        # Upstream MeroShare auth/fetch failure — record nothing, stamp nothing.
        for rule in rules:
            out["rules"].append({"rule_id": rule.id, "name": rule.name,
                                 "applied": 0, "already": 0, "skipped_idempotent": 0,
                                 "dry_run": 0, "failed": 0,
                                 "note": f"ipo fetch failed: {e.detail}"})
        return out

    for rule in rules:
        counts = {"rule_id": rule.id, "name": rule.name, "applied": 0, "already": 0,
                  "skipped_idempotent": 0, "dry_run": 0, "failed": 0}
        kitta = min(_rule_kitta(rule), rule.max_kitta if rule.max_kitta is not None else DEFAULT_MAX_KITTA)
        max_accounts = rule.max_accounts if rule.max_accounts is not None else DEFAULT_MAX_ACCOUNTS

        # Restrict to configured accounts, then cap how many accounts this rule
        # may touch this run (blast-radius cap).
        wanted_ids = _rule_account_ids(rule)
        accounts = user_accounts
        if wanted_ids:
            wanted = set(wanted_ids)
            accounts = [a for a in accounts if a.id in wanted]
        capped_accounts = accounts[:max_accounts]

        matched_ipos = [i for i in open_ipos if _ipo_matches_rule(i, rule)]

        for acc in capped_accounts:
            # Load decrypted creds for THIS account only (engine applies per acct).
            for ipo in matched_ipos:
                company_id = ipo.get("companyShareId")
                if company_id is None:
                    continue
                if _already_done(db, db_user.id, acc.username, company_id):
                    counts["skipped_idempotent"] += 1
                    continue

                if not (armed and not dry_run):
                    # DRY-RUN: record intent, never touch MeroShare.
                    _record_dry_run(db, db_user.id, acc.username, company_id, kitta,
                                    ipo.get("companyName"), ipo.get("scrip"))
                    counts["dry_run"] += 1
                    continue

                # ── ARMED real apply ──────────────────────────────────────────
                acc_data = server._load_accounts(db_user, db, [acc.id])
                if not acc_data:
                    counts["failed"] += 1
                    continue
                ms_user = server.make_user(acc_data[0])
                result = server.apply_single(ms_user, company_id, kitta)
                result["company_id"] = company_id
                server._record_history(db, db_user.id, result, company_id, kitta,
                                       ipo.get("companyName"), ipo.get("scrip"))
                status = result.get("status")
                if status == "success":
                    counts["applied"] += 1
                elif status == "already_applied":
                    counts["already"] += 1
                else:
                    counts["failed"] += 1

        rule.last_run_at = datetime.utcnow()
        out["rules"].append(counts)

    db.commit()
    return out


def _record_dry_run(db: Session, user_id: int, account_username: str, company_id: int,
                    kitta: int, company_name: Optional[str], scrip: Optional[str]) -> None:
    """Persist a `dry_run` ApplicationHistory row recording intent. Never breaks
    the run on a DB error (mirrors server._record_history)."""
    try:
        row = ApplicationHistory(
            user_id=user_id,
            account_username=account_username or "",
            company_id=company_id,
            company_name=company_name,
            scrip=scrip,
            kitta=kitta,
            status="dry_run",
        )
        db.add(row)
        db.commit()
    except Exception:
        logger.warning("[SCHEDULER] failed to persist dry_run row", exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass


@router.api_route("/run", methods=["POST", "GET"])
def run_engine(request: Request, db: Session = Depends(get_db)):
    """Cron-triggered automation engine entrypoint.

    Auth: NOT the user cookie. Requires `Authorization: Bearer <CRON_SECRET>`.
    Vercel Cron sends this header automatically when CRON_SECRET is set. GET is
    accepted alongside POST because Vercel Cron issues GET requests.

    Disabled (503) when CRON_SECRET is unset — we never run unauthenticated.
    Defaults to DRY-RUN; only AUTOMATION_ARMED=true + ?dry_run=false applies real.
    """
    cron_secret = os.environ.get("CRON_SECRET", "").strip()
    if not cron_secret:
        # No secret configured -> engine is OFF. Never fall through to running.
        raise HTTPException(503, "Automation engine disabled (CRON_SECRET unset)")

    auth_header = request.headers.get("authorization", "")
    expected = f"Bearer {cron_secret}"
    # constant-time-ish compare (length + hmac) to avoid leaking via timing.
    import hmac
    if not hmac.compare_digest(auth_header, expected):
        raise HTTPException(401, "Invalid or missing cron credentials")

    armed = _truthy(os.environ.get("AUTOMATION_ARMED"))
    # dry_run defaults True. It is False ONLY when ?dry_run explicitly says false.
    # The param can only ever make a run SAFER — it never enables real applies on
    # its own (the `armed` gate below is the one that does).
    dry_run_param = request.query_params.get("dry_run")
    dry_run = not (dry_run_param is not None
                   and dry_run_param.strip().lower() in ("false", "0", "no", "off"))

    # HARD INVARIANT: real applies require BOTH armed AND an explicit non-dry run.
    will_apply = armed and not dry_run

    # Find every user that owns at least one active rule, then run per user.
    user_ids = [
        uid for (uid,) in db.query(SchedulerRule.user_id)
        .filter(SchedulerRule.active.is_(True)).distinct().all()
    ]
    summaries = []
    for uid in user_ids:
        db_user = db.query(User).filter(User.id == uid).first()
        if not db_user:
            continue
        try:
            summaries.append(_run_engine_for_user(db, db_user, armed=armed, dry_run=dry_run))
        except Exception:
            logger.warning("[SCHEDULER] engine failed for user %s", uid, exc_info=True)
            try:
                db.rollback()
            except Exception:
                pass
            summaries.append({"user_id": uid, "rules": [], "error": "engine failure"})

    return {
        "mode": "armed" if will_apply else "dry_run",
        "armed": armed,
        "dry_run": not will_apply,
        "users_processed": len(summaries),
        "summaries": summaries,
    }
