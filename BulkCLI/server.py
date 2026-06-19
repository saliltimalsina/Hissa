#!/usr/bin/env python3
"""FastAPI server — Nepal Capital Operating System"""

import sys
import json
import logging
import asyncio
from pathlib import Path
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import os

from contextlib import asynccontextmanager

import requests as req_lib
from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, conlist
from sqlalchemy.orm import Session
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware

src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

from src.models.user import User
from src.models.ipo_application import IPOApplication
from src.services.application_service import ApplicationService
from src.config.settings import get_settings
from src.config.security import FRONTEND_URL, IS_PROD
from src.config.ratelimit import limiter
from src.db.database import get_db
from src.db.models import User as DBUser, ApplicationHistory
from src.auth.jwt_handler import get_current_user
from src.auth.session import require_csrf
from src.routers.accounts import get_decrypted_accounts
from src.routers import auth as auth_router
from src.routers import accounts as accounts_router
from src.routers import history as history_router
from src.routers import scheduler as scheduler_router

@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """Create DB tables if they don't exist (fresh Postgres on first deploy).

    create_all is idempotent, but on Vercel this runs once per COLD START.
    CRITICAL (serverless): a transient DB hiccup at startup (e.g. Neon waking
    from idle, or a slow first connection) must NOT crash the whole function —
    that would 500 every route, including DB-free ones like /api/brokers. So we
    swallow startup DB errors and log them; create_all will succeed on a later
    request once the DB is reachable, and DB-touching routes self-heal via the
    lazy ensure below.
    """
    try:
        from src.db.database import init_db
        init_db()
    except Exception:
        import sys, traceback
        traceback.print_exc(file=sys.stderr)
        logger.warning("startup init_db() failed; continuing, will retry lazily")
    yield


app = FastAPI(title="Hissa API", lifespan=_lifespan)

# Rate limiting (slowapi) — keyed by client IP, applied per-endpoint in routers.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# Allowed CORS origins: env-driven, defaulting to local dev + the prod frontend.
# (In production the frontend and API are same-origin via the Vercel rewrite,
# so CORS mainly matters for local dev and any direct API access.)
# SEC-07: with allow_credentials=True we MUST send an explicit origin list (never
# "*"). Localhost/127.0.0.1 dev origins are included only in dev; in prod they are
# excluded so a malicious page served from localhost can't ride a user's cookies.
_dev_origins = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
]
_prod_origins = [FRONTEND_URL]
_env_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if IS_PROD:
    _base_origins = _prod_origins
else:
    _base_origins = _dev_origins + _prod_origins
ALLOWED_ORIGINS = sorted(set(_base_origins + _env_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)


# Security response headers applied to every response (HSTS, sniffing,
# clickjacking, referrer leakage).
@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


# Mount feature routers (all auth-gated; auth router under /api/auth).
app.include_router(auth_router.router)
app.include_router(accounts_router.router)
app.include_router(history_router.router)
app.include_router(scheduler_router.router)

settings = get_settings()
BASE = settings.API_BASE_URL
JSON_H = {"Accept": "application/json", "Content-Type": "application/json"}

logger = logging.getLogger(__name__)
# Verbose diagnostics (raw upstream bodies / sample values) are gated behind this
# flag, which defaults OFF so they never reach stdout in production.
DEBUG = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")

# Broker list is static — load capitals.json once at import rather than reading
# it from disk on every /api/brokers request (incl. the frequent healthcheck).
try:
    with open(Path(__file__).parent / "capitals.json") as _f:
        _BROKERS = json.load(_f)
except Exception:
    logger.warning("Failed to load capitals.json", exc_info=True)
    _BROKERS = []


# ── Models ────────────────────────────────────────────────────────────────────

class AccountData(BaseModel):
    """Internal representation — decrypted creds loaded from the DB, never from
    the client. The request models below reference accounts by id only."""
    client_id: int
    username: str
    password: str
    crn: str
    pin: int
    label: Optional[str] = None
    group: Optional[str] = None

class AccountSelect(BaseModel):
    # None => operate on all of the user's accounts.
    account_ids: Optional[List[int]] = None

class ApplyRequest(BaseModel):
    company_id: int
    kitta: int
    account_ids: Optional[List[int]] = None
    # Optional IPO metadata for the persisted history row; if absent the row
    # stores NULL/blank for these (the apply must not fail on missing metadata).
    company_name: Optional[str] = None
    scrip: Optional[str] = None

class MultiAllocation(BaseModel):
    account_id: int
    company_id: int
    kitta: int
    # Optional IPO metadata (see ApplyRequest) carried per-allocation.
    company_name: Optional[str] = None
    scrip: Optional[str] = None

class MultiApplyRequest(BaseModel):
    # Bounded: apply_multi does a MeroShare round-trip per allocation.
    allocations: conlist(MultiAllocation, max_length=200)


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_user(acc: AccountData) -> User:
    return User(client_id=acc.client_id, username=acc.username,
                password=acc.password, crn=acc.crn, pin=acc.pin)


def _load_accounts(current_user: DBUser, db: Session,
                   account_ids: Optional[List[int]] = None) -> List[AccountData]:
    """Load the logged-in user's MeroShare accounts (decrypted) from the DB.

    Credentials never come from the client — only an optional list of account
    ids to filter by. Returns AccountData usable by the existing helpers.
    """
    accs = get_decrypted_accounts(current_user, db)
    if account_ids:
        wanted = set(account_ids)
        accs = [a for a in accs if a["id"] in wanted]
    out: List[AccountData] = []
    for a in accs:
        try:
            pin = int(str(a["pin"]).strip())
        except (ValueError, TypeError):
            pin = 0
        out.append(AccountData(
            client_id=a["client_id"], username=a["username"],
            password=a["password"], crn=a["crn"], pin=pin,
            label=a.get("label"), group=a.get("group_name"),
        ))
    return out


def auth(acc: AccountData) -> Optional[str]:
    try:
        r = req_lib.post(f"{BASE}/meroShare/auth/",
            json={"clientId": acc.client_id, "username": acc.username, "password": acc.password},
            headers=JSON_H, timeout=12)
    except Exception as e:
        print(f"[AUTH] {acc.username} EXCEPTION: {e}", flush=True)
        return None
    if r.status_code != 200:
        if DEBUG:
            print(f"[AUTH] {acc.username} HTTP {r.status_code}: {r.text[:150]}", flush=True)
        return None
    return r.headers.get("Authorization", "").strip() or None


def apply_single(user: User, company_id: int, kitta: int) -> dict:
    application = IPOApplication(user_id=str(user.client_id), user_name=user.username,
                                  company_id=company_id, kitta_amount=kitta)
    svc = ApplicationService()
    already_applied = False  # F12: set True when upstream says the account already applied
    try:
        from src.api.meroshare_client import MeroShareClient
        client = MeroShareClient()
        token = client.authenticate(user)
        if not token:
            application.mark_failed("Authentication failed")
            return application.to_dict()
        personal = client.get_personal_details(token)
        if not personal:
            application.mark_failed("Failed to get personal details")
            return application.to_dict()
        boid = client.get_client_boid_details(token, personal["demat"])
        if not boid:
            application.mark_failed("Failed to get BOID")
            return application.to_dict()
        bank = client.get_bank_details(token, boid["bankCode"])
        app_data = svc._prepare_application_data(user, personal, boid, bank, company_id, kitta, token)
        if not app_data:
            application.mark_failed("Failed to prepare application data")
            return application.to_dict()
        # Direct POST so we can capture the real MeroShare error message.
        # Coerce transactionPIN to string — MeroShare expects string, model has int.
        apply_url = f"{BASE}/meroShare/applicantForm/share/apply/"
        h = {**JSON_H, "Authorization": token}
        if "transactionPIN" in app_data:
            app_data["transactionPIN"] = str(app_data["transactionPIN"])
        print(f"[APPLY] {user.username} → company {company_id}, kitta {kitta}", flush=True)
        r = req_lib.post(apply_url, json=app_data, headers=h, timeout=15)
        if DEBUG:
            print(f"[APPLY] {user.username} ← HTTP {r.status_code}: {r.text[:300]}", flush=True)
        body = {}
        try:
            body = r.json() if isinstance(r.json(), dict) else (r.json()[0] if r.json() else {})
        except Exception:
            pass
        msg = (body.get("message") or body.get("errorMessage") or body.get("error") or "").lower()
        # F12: distinguish "already applied" from a genuine fresh success. An
        # account that had already applied is NOT a green success — it is a
        # distinct terminal state surfaced as `already_applied`. Match the
        # upstream "already" wording explicitly (e.g. "already applied",
        # "you have already") rather than treating any 'already' substring as
        # success without flagging it.
        already_applied = "already" in msg
        # Tightened: a fresh success must come from a real success HTTP code or
        # an explicit success message — not from the bare 'already' substring.
        success_signals = ("applied successfully", "share has been applied")
        if already_applied:
            # mark_success keeps error_message empty / last_attempt set; we then
            # override the status to the distinct value (the IPOApplication model
            # only validates the CLI status set, so set it on the dict below).
            application.mark_success()
        elif r.status_code in (200, 201) or any(s in msg for s in success_signals):
            application.mark_success()
        else:
            # Raw upstream body may contain internal/PII details — log it
            # server-side only and surface a generic message to the client.
            logger.warning("[APPLY] %s failed: HTTP %s: %s",
                           user.username, r.status_code, r.text[:300])
            err_msg = (body.get("message") or body.get("errorMessage")
                       or body.get("error") or "Application failed")
            application.mark_failed(err_msg)
    except Exception as e:
        application.mark_failed(str(e))
    application.increment_attempts()
    result = application.to_dict()
    if already_applied:
        result["status"] = "already_applied"
    return result


def _record_history(db: Session, user_id: int, result: dict,
                    company_id: int, kitta: int,
                    company_name: Optional[str] = None,
                    scrip: Optional[str] = None) -> None:
    """F2: persist one ApplicationHistory row for a per-account apply result.

    Called from the apply route generators where a request-scoped `db` Session is
    in scope (apply_single itself runs in a ThreadPoolExecutor with no db).

    A history write must NEVER break the user's apply stream: any DB error is
    logged and swallowed (and the session rolled back) so the next allocation
    still streams. Missing IPO metadata (company_name/scrip) is stored as
    NULL/blank rather than failing the insert.
    """
    try:
        row = ApplicationHistory(
            user_id=user_id,
            account_username=result.get("user_name") or "",
            company_id=company_id,
            company_name=company_name,
            scrip=scrip,
            kitta=kitta,
            status=result.get("status") or "failed",
            error_message=result.get("error_message") or None,
        )
        db.add(row)
        db.commit()
    except Exception:
        logger.warning("[HISTORY] failed to persist application history", exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass


def _fetch_account_snapshot(acc: AccountData) -> dict:
    base = {"username": acc.username, "label": acc.label or acc.username}
    try:
        token = auth(acc)
        if not token:
            return {**base, "status": "auth_failed", "error": "Authentication failed"}
        h = {**JSON_H, "Authorization": token}
        d = req_lib.get(f"{BASE}/meroShare/ownDetail/", headers=h, timeout=10).json()
        expired_str = d.get("expiredDateStr", "")
        days = None
        if expired_str:
            try:
                days = (datetime.strptime(expired_str, "%Y-%m-%d") - datetime.now()).days
            except Exception:
                pass
        status = "healthy"
        if days is not None:
            if days < 0:
                status = "expired"
            elif days <= 30:
                status = "expiring"
        return {
            **base,
            "name": d.get("name", acc.username),
            "demat": d.get("demat", ""),
            "client_code": d.get("clientCode", ""),
            "boid": d.get("boid", ""),
            "email": d.get("email", ""),
            "status": status,
            "days_to_expiry": days,
            "expired_date": expired_str,
            "demat_expiry": d.get("dematExpiryDate", ""),
            "password_expiry": d.get("passwordExpiryDateStr", ""),
            "renewed_date": d.get("renewedDateStr", ""),
        }
    except Exception as e:
        return {**base, "status": "error", "error": str(e)}


def _fetch_account_portfolio(acc: AccountData) -> dict:
    base = {"username": acc.username, "label": acc.label or acc.username, "total_value": 0, "holdings": []}
    try:
        token = auth(acc)
        if not token:
            return {**base, "error": "Auth failed"}
        h = {**JSON_H, "Authorization": token}
        d = req_lib.get(f"{BASE}/meroShare/ownDetail/", headers=h, timeout=10).json()
        demat = d.get("demat", "")
        client_code = d.get("clientCode", "")
        name = d.get("name", acc.username)
        payload = {"sortBy": "script", "demat": [demat], "clientCode": client_code,
                   "page": 1, "size": 200, "sortAsc": True}
        pr = req_lib.post(f"{BASE}/meroShareView/myPortfolio/", json=payload, headers=h, timeout=15)
        holdings = pr.json().get("meroShareMyPortfolio", [])
        total = sum(h2.get("valueOfLastTransPrice", 0) for h2 in holdings)
        return {"username": acc.username, "label": acc.label or acc.username,
                "name": name, "holdings": holdings, "total_value": total, "count": len(holdings)}
    except Exception as e:
        return {**base, "error": str(e)}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/snapshot")
def get_snapshot(body: AccountSelect = AccountSelect(),
                 current_user: DBUser = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """Parallel fetch ownDetail — capped to 2 concurrent to avoid MeroShare auth rate-limit"""
    accounts = _load_accounts(current_user, db, body.account_ids)
    results = []
    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {ex.submit(_fetch_account_snapshot, acc): acc for acc in accounts}
        for f in as_completed(futures):
            results.append(f.result())
    results.sort(key=lambda x: x.get("username", ""))
    summary = {
        "total": len(results),
        "healthy": sum(1 for r in results if r.get("status") == "healthy"),
        "expiring": sum(1 for r in results if r.get("status") == "expiring"),
        "expired": sum(1 for r in results if r.get("status") == "expired"),
        "failed": sum(1 for r in results if r.get("status") in ["auth_failed", "error"]),
    }
    return {"accounts": results, "summary": summary}


@app.post("/api/portfolio/aggregate")
def get_portfolio_aggregate(body: AccountSelect = AccountSelect(),
                            current_user: DBUser = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    """Parallel fetch portfolio — capped to 2 concurrent to avoid MeroShare auth rate-limit"""
    accounts = _load_accounts(current_user, db, body.account_ids)
    results = []
    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {ex.submit(_fetch_account_portfolio, acc): acc for acc in accounts}
        for f in as_completed(futures):
            results.append(f.result())
    results.sort(key=lambda x: x.get("username", ""))
    grand_total = sum(r.get("total_value", 0) for r in results)
    return {"accounts": results, "grand_total": grand_total}


@app.post("/api/ipos")
def get_ipos(body: AccountSelect = AccountSelect(),
             current_user: DBUser = Depends(get_current_user),
             db: Session = Depends(get_db)):
    accounts = _load_accounts(current_user, db, body.account_ids)
    if not accounts:
        raise HTTPException(400, "No accounts configured")
    # Try each account in order until one authenticates successfully
    token = None
    failed_users = []
    for acc in accounts:
        token = auth(acc)
        if token:
            break
        failed_users.append(acc.username)
    if not token:
        # 502, NOT 401 — this is an UPSTREAM (MeroShare) auth failure, not an
        # expired Hissa session. A 401 here would make the frontend think the
        # user's session died and log them out.
        raise HTTPException(502, f"MeroShare authentication failed for all accounts: {', '.join(failed_users)}")
    def _payload(page: int, size: int) -> dict:
        return {
            "filterFieldParams": [
                {"key": "companyIssue.companyISIN.script", "alias": "Scrip"},
                {"key": "companyIssue.companyISIN.company.name", "alias": "Company Name"},
                {"key": "companyIssue.assignedToClient.name", "value": "", "alias": "Issue Manager"},
            ],
            "page": page, "size": size,
            "searchRoleViewConstants": "VIEW_APPLICABLE_SHARE",
            "filterDateParams": [
                {"key": "minIssueOpenDate", "condition": "", "alias": "", "value": ""},
                {"key": "maxIssueCloseDate", "condition": "", "alias": "", "value": ""},
            ],
        }

    # F8: page through the applicableIssue feed so >20 open issues are not
    # silently truncated. A larger page size keeps the common case to one round
    # trip; the loop drains any overflow (bounded so a misbehaving upstream can't
    # spin forever).
    PAGE_SIZE = 200
    MAX_PAGES = 10
    h = {**JSON_H, "Authorization": token}
    raw_issues = []
    for page in range(1, MAX_PAGES + 1):
        r = req_lib.post(f"{BASE}/meroShare/companyShare/applicableIssue/",
            json=_payload(page, PAGE_SIZE), headers=h, timeout=15)
        if r.status_code != 200:
            # F8: a non-200 AFTER successful auth is a real UPSTREAM outage, not
            # "no IPOs open" — surface it as a 502 rather than masquerading as an
            # empty list. (502, not 401, so the frontend doesn't log the user out.)
            logger.warning("[IPOS] applicableIssue page %s failed: HTTP %s: %s",
                           page, r.status_code, r.text[:300])
            raise HTTPException(502, "Failed to fetch IPOs from MeroShare")
        batch = r.json().get("object", []) or []
        raw_issues.extend(batch)
        if len(batch) < PAGE_SIZE:
            break  # last (partial) page reached
    return [
        {
            "companyShareId": i.get("companyShareId"),
            "companyName": i.get("companyName", "Unknown"),
            "scrip": i.get("scrip", ""),
            "shareTypeName": i.get("shareTypeName", ""),
            "shareGroupName": i.get("shareGroupName", ""),
            "minUnit": i.get("minUnit", 10),
            "maxUnit": i.get("maxUnit", 10),
            "issueOpenDate": i.get("issueOpenDate", ""),
            "issueCloseDate": i.get("issueCloseDate", ""),
            "action": i.get("action", ""),
        }
        for i in raw_issues
    ]


@app.post("/api/apply/multi")
async def apply_multi(req: MultiApplyRequest,
                      current_user: DBUser = Depends(get_current_user),
                      db: Session = Depends(get_db),
                      _csrf: None = Depends(require_csrf)):
    """Stream multi-IPO × multi-account allocation results"""
    # Map account_id -> decrypted account so allocations can reference accounts by id.
    decrypted = {a["id"]: a for a in get_decrypted_accounts(current_user, db)}

    def _acc_data(account_id: int) -> Optional[AccountData]:
        a = decrypted.get(account_id)
        if not a:
            return None
        try:
            pin = int(str(a["pin"]).strip())
        except (ValueError, TypeError):
            pin = 0
        return AccountData(client_id=a["client_id"], username=a["username"],
                           password=a["password"], crn=a["crn"], pin=pin,
                           label=a.get("label"), group=a.get("group_name"))

    loop = asyncio.get_event_loop()

    async def generate():
        total = len(req.allocations)
        yield json.dumps({"type": "start", "total": total}) + "\n"
        for i, alloc in enumerate(req.allocations):
            acc = _acc_data(alloc.account_id)
            if acc is None:
                not_found = {"user_name": "?", "status": "failed",
                             "error_message": "Account not found",
                             "company_id": alloc.company_id, "kitta_amount": alloc.kitta}
                _record_history(db, current_user.id, not_found, alloc.company_id,
                                alloc.kitta, alloc.company_name, alloc.scrip)
                yield json.dumps({"type": "progress", "index": i, "total": total,
                    "result": not_found}) + "\n"
                continue
            user = make_user(acc)
            result = await loop.run_in_executor(None, apply_single, user, alloc.company_id, alloc.kitta)
            result["company_id"] = alloc.company_id
            _record_history(db, current_user.id, result, alloc.company_id,
                            alloc.kitta, alloc.company_name, alloc.scrip)
            yield json.dumps({"type": "progress", "index": i, "total": total, "result": result}) + "\n"
            await asyncio.sleep(1.0)
        yield json.dumps({"type": "complete"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


# kept for backward compat
@app.post("/api/apply")
async def apply_bulk(req: ApplyRequest,
                     current_user: DBUser = Depends(get_current_user),
                     db: Session = Depends(get_db),
                     _csrf: None = Depends(require_csrf)):
    accounts = _load_accounts(current_user, db, req.account_ids)
    users = [make_user(acc) for acc in accounts]
    loop = asyncio.get_event_loop()

    async def generate():
        total = len(users)
        yield json.dumps({"type": "start", "total": total}) + "\n"
        for i, user in enumerate(users):
            result = await loop.run_in_executor(None, apply_single, user, req.company_id, req.kitta)
            _record_history(db, current_user.id, result, req.company_id,
                            req.kitta, req.company_name, req.scrip)
            yield json.dumps({"type": "progress", "index": i, "total": total, "result": result}) + "\n"
            await asyncio.sleep(1.0)
        yield json.dumps({"type": "complete"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/api/brokers")
def get_brokers():
    return _BROKERS


def _fetch_account_reports(acc: AccountData) -> dict:
    base = {"username": acc.username, "label": acc.label or acc.username}
    try:
        token = auth(acc)
        if not token:
            return {**base, "error": "Authentication failed", "applications": []}
        h = {**JSON_H, "Authorization": token}
        payload = {
            "filterFieldParams": [
                {"key": "companyShare.companyIssue.companyISIN.script", "alias": "Scrip"},
                {"key": "companyShare.companyIssue.companyISIN.company.name", "alias": "Company Name"},
            ],
            "page": 1, "size": 100,
            "searchRoleViewConstants": "VIEW_APPLICANT_FORM_COMPLETE",
            "filterDateParams": [],
        }
        r = req_lib.post(f"{BASE}/meroShare/applicantForm/active/search/",
            json=payload, headers=h, timeout=15)
        if DEBUG:
            print(f"[REPORTS] {acc.username} ← HTTP {r.status_code}", flush=True)
        if r.status_code != 200:
            # Log raw upstream body server-side; return a generic error.
            logger.warning("[REPORTS] %s search failed: HTTP %s: %s",
                           acc.username, r.status_code, r.text[:300])
            return {**base, "error": "Failed to fetch reports", "applications": []}
        raw = r.json()
        if isinstance(raw, dict):
            apps = raw.get("object") or raw.get("data") or raw.get("result") or []
        elif isinstance(raw, list):
            apps = raw
        else:
            apps = []
        if DEBUG:
            print(f"[REPORTS] {acc.username} response top keys: {list(raw.keys()) if isinstance(raw, dict) else type(raw).__name__}, apps={len(apps)}", flush=True)
            if apps:
                print(f"[REPORTS] {acc.username} sample app keys: {list(apps[0].keys())[:35]}", flush=True)
                print(f"[REPORTS] {acc.username} sample app values: {dict(list(apps[0].items())[:10])}", flush=True)
        # Fetch detail per application to get full status, remarks, block amount, transaction amount
        for a in apps[:25]:  # cap to recent 25
            fid = a.get("applicantFormId")
            if not fid:
                continue
            try:
                d = req_lib.get(f"{BASE}/meroShare/applicantForm/report/detail/{fid}", headers=h, timeout=10)
                if d.status_code == 200:
                    detail = d.json() or {}
                    for k in ("statusName", "meroshareRemark", "blockAmountStatus", "transactionAmount", "appliedKitta", "allotedQuantity", "alloted", "reservationTypeName"):
                        if detail.get(k) is not None:
                            a[k] = detail.get(k)
            except Exception:
                pass
        # Trim to relevant fields
        slim = [{
            "applicantFormId": a.get("applicantFormId"),
            "companyShareId": a.get("companyShareId"),
            "companyName": a.get("companyName"),
            "scrip": a.get("scrip"),
            "shareTypeName": a.get("shareTypeName"),
            "shareGroupName": a.get("shareGroupName"),
            "statusName": a.get("statusName"),
            "appliedKitta": a.get("appliedKitta"),
            "alloted": a.get("alloted"),
            "allotedQuantity": a.get("allotedQuantity"),
            "meroshareRemark": a.get("meroshareRemark"),
            "blockAmountStatus": a.get("blockAmountStatus"),
            "transactionAmount": a.get("transactionAmount"),
            "issueOpenDate": a.get("issueOpenDate"),
            "issueCloseDate": a.get("issueCloseDate"),
            "reservationTypeName": a.get("reservationTypeName"),
        } for a in apps]
        return {**base, "applications": slim}
    except Exception as e:
        return {**base, "error": str(e), "applications": []}


@app.post("/api/reports")
def get_reports(body: AccountSelect = AccountSelect(),
                current_user: DBUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Serial fetch application reports — MeroShare rate-limits concurrent auths."""
    import time
    accounts = _load_accounts(current_user, db, body.account_ids)
    results = []
    for acc in accounts:
        results.append(_fetch_account_reports(acc))
        time.sleep(0.3)  # small gap to avoid rate limiting
    results.sort(key=lambda x: x.get("username", ""))
    return {"accounts": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
