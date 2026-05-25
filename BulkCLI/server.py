#!/usr/bin/env python3
"""FastAPI server — Nepal Capital Operating System"""

import os
import sys
import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import asynccontextmanager

import requests as req_lib
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

from src.db.database import get_db, init_db
from src.db.models import User, MSAccount, ApplicationHistory, SchedulerRule
from src.auth.jwt_handler import get_current_user
from src.auth.crypto import decrypt
from src.routers import auth, accounts, history, scheduler
from src.models.user import User as MSUser
from src.models.ipo_application import IPOApplication
from src.services.application_service import ApplicationService
from src.config.settings import get_settings

CAPITALS_PATH = Path(__file__).parent / "capitals.json"
log = logging.getLogger(__name__)
settings = get_settings()
BASE = settings.API_BASE_URL
JSON_H = {"Accept": "application/json", "Content-Type": "application/json"}


# ── Scheduler ─────────────────────────────────────────────────────────────────

def _run_scheduler_tick():
    """Check all active scheduler rules and auto-apply matching IPOs."""
    try:
        from src.db.database import SessionLocal
        db = SessionLocal()
        try:
            rules = db.query(SchedulerRule).filter(SchedulerRule.active == True).all()
            if not rules:
                return

            for rule in rules:
                user = db.query(User).filter(User.id == rule.user_id).first()
                if not user:
                    continue
                ms_accounts = db.query(MSAccount).filter(MSAccount.user_id == user.id).all()
                if not ms_accounts:
                    continue

                cfg = json.loads(rule.config_json)
                kitta = cfg.get("kitta", 10)
                sectors = cfg.get("sectors")

                # Get open IPOs using first account
                first = ms_accounts[0]
                first_pass = decrypt(first.enc_password, user.id)
                token = _auth_raw(first.client_id, first.username, first_pass)
                if not token:
                    continue

                ipos = _fetch_ipos_raw(token)
                if not ipos:
                    continue

                # Filter by sectors if rule_type is sector_filter
                if rule.rule_type == "sector_filter" and sectors:
                    ipos = [i for i in ipos if any(
                        s.lower() in (i.get("shareTypeName", "") + i.get("shareGroupName", "")).lower()
                        for s in sectors
                    )]

                # Find IPOs not yet applied to
                for ipo in ipos:
                    company_id = ipo.get("companyShareId")
                    if not company_id:
                        continue
                    already = db.query(ApplicationHistory).filter(
                        ApplicationHistory.user_id == user.id,
                        ApplicationHistory.company_id == company_id,
                    ).first()
                    if already:
                        continue

                    # Apply to matching accounts
                    target_ids = cfg.get("account_ids")
                    apply_accounts = ms_accounts if not target_ids else [
                        a for a in ms_accounts if a.id in target_ids
                    ]

                    for acc in apply_accounts:
                        ms_user = MSUser(
                            client_id=acc.client_id,
                            username=acc.username,
                            password=decrypt(acc.enc_password, user.id),
                            crn=decrypt(acc.enc_crn, user.id),
                            pin=int(decrypt(acc.enc_pin, user.id)),
                        )
                        result = _apply_single(ms_user, company_id, kitta)
                        entry = ApplicationHistory(
                            user_id=user.id,
                            account_username=acc.username,
                            company_id=company_id,
                            company_name=ipo.get("companyName"),
                            scrip=ipo.get("scrip"),
                            kitta=kitta,
                            status=result.get("status", "failed"),
                            error_message=result.get("error_message"),
                        )
                        db.add(entry)
                    db.commit()

                rule.last_run_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()
    except Exception as e:
        log.error(f"Scheduler tick error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    from apscheduler.schedulers.background import BackgroundScheduler
    sched = BackgroundScheduler()
    sched.add_job(_run_scheduler_tick, "interval", minutes=15, id="auto_apply")
    sched.start()
    yield
    sched.shutdown(wait=False)


app = FastAPI(title="Nepal Capital OS API", lifespan=lifespan)

_local_origins = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://localhost:5175",
    "http://localhost:5176",
]
_extra = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_local_origins + _extra,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(history.router)
app.include_router(scheduler.router)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _auth_raw(client_id: int, username: str, password: str) -> Optional[str]:
    try:
        r = req_lib.post(
            f"{BASE}/meroShare/auth/",
            json={"clientId": client_id, "username": username, "password": password},
            headers=JSON_H, timeout=12,
        )
        if r.status_code != 200:
            return None
        return r.headers.get("Authorization", "").strip() or None
    except Exception:
        return None


def _fetch_ipos_raw(token: str) -> list:
    payload = {
        "filterFieldParams": [
            {"key": "companyIssue.companyISIN.script", "alias": "Scrip"},
            {"key": "companyIssue.companyISIN.company.name", "alias": "Company Name"},
            {"key": "companyIssue.assignedToClient.name", "value": "", "alias": "Issue Manager"},
        ],
        "page": 1, "size": 20,
        "searchRoleViewConstants": "VIEW_APPLICABLE_SHARE",
        "filterDateParams": [
            {"key": "minIssueOpenDate", "condition": "", "alias": "", "value": ""},
            {"key": "maxIssueCloseDate", "condition": "", "alias": "", "value": ""},
        ],
    }
    try:
        r = req_lib.post(
            f"{BASE}/meroShare/companyShare/applicableIssue/",
            json=payload, headers={**JSON_H, "Authorization": token}, timeout=15,
        )
        if r.status_code != 200:
            return []
        return r.json().get("object", [])
    except Exception:
        return []


def _apply_single(ms_user: MSUser, company_id: int, kitta: int) -> dict:
    application = IPOApplication(
        user_id=str(ms_user.client_id),
        user_name=ms_user.username,
        company_id=company_id,
        kitta_amount=kitta,
    )
    svc = ApplicationService()
    try:
        from src.api.meroshare_client import MeroShareClient
        client = MeroShareClient()
        token = client.authenticate(ms_user)
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
        app_data = svc._prepare_application_data(ms_user, personal, boid, bank, company_id, kitta, token)
        if not app_data:
            application.mark_failed("Failed to prepare application data")
            return application.to_dict()
        result = client.apply_ipo(token, app_data)
        if result:
            application.mark_success()
        else:
            application.mark_failed("Application rejected by server")
    except Exception as e:
        application.mark_failed(str(e))
    application.increment_attempts()
    return application.to_dict()


def _fetch_snapshot_single(acc_dict: dict) -> dict:
    base = {"username": acc_dict["username"], "label": acc_dict.get("label") or acc_dict["username"]}
    try:
        token = _auth_raw(acc_dict["client_id"], acc_dict["username"], acc_dict["password"])
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
        status_val = "healthy"
        if days is not None:
            if days < 0:
                status_val = "expired"
            elif days <= 30:
                status_val = "expiring"
        return {
            **base,
            "name": d.get("name", acc_dict["username"]),
            "demat": d.get("demat", ""),
            "client_code": d.get("clientCode", ""),
            "boid": d.get("boid", ""),
            "email": d.get("email", ""),
            "status": status_val,
            "days_to_expiry": days,
            "expired_date": expired_str,
            "demat_expiry": d.get("dematExpiryDate", ""),
            "password_expiry": d.get("passwordExpiryDateStr", ""),
            "renewed_date": d.get("renewedDateStr", ""),
        }
    except Exception as e:
        return {**base, "status": "error", "error": str(e)}


def _fetch_portfolio_single(acc_dict: dict) -> dict:
    base = {"username": acc_dict["username"], "label": acc_dict.get("label") or acc_dict["username"], "total_value": 0, "holdings": []}
    try:
        token = _auth_raw(acc_dict["client_id"], acc_dict["username"], acc_dict["password"])
        if not token:
            return {**base, "error": "Auth failed"}
        h = {**JSON_H, "Authorization": token}
        d = req_lib.get(f"{BASE}/meroShare/ownDetail/", headers=h, timeout=10).json()
        demat = d.get("demat", "")
        client_code = d.get("clientCode", "")
        name = d.get("name", acc_dict["username"])
        payload = {"sortBy": "script", "demat": [demat], "clientCode": client_code,
                   "page": 1, "size": 200, "sortAsc": True}
        pr = req_lib.post(f"{BASE}/meroShareView/myPortfolio/", json=payload, headers=h, timeout=15)
        holdings = pr.json().get("meroShareMyPortfolio", [])
        total = sum(h2.get("valueOfLastTransPrice", 0) for h2 in holdings)
        return {"username": acc_dict["username"], "label": acc_dict.get("label") or acc_dict["username"],
                "name": name, "holdings": holdings, "total_value": total, "count": len(holdings)}
    except Exception as e:
        return {**base, "error": str(e)}


def _get_user_accounts_decrypted(user: User, db: Session) -> list:
    accs = db.query(MSAccount).filter(MSAccount.user_id == user.id).all()
    return [
        {
            "id": a.id,
            "username": a.username,
            "client_id": a.client_id,
            "label": a.label,
            "group_name": a.group_name,
            "password": decrypt(a.enc_password, user.id),
            "pin": decrypt(a.enc_pin, user.id),
            "crn": decrypt(a.enc_crn, user.id),
        }
        for a in accs
    ]


# ── Public endpoints ──────────────────────────────────────────────────────────

@app.get("/api/brokers")
def get_brokers():
    return json.loads(CAPITALS_PATH.read_text())


# ── Protected endpoints ───────────────────────────────────────────────────────

@app.get("/api/ipos")
def get_ipos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accs = _get_user_accounts_decrypted(current_user, db)
    if not accs:
        raise HTTPException(400, "No accounts configured")
    token = _auth_raw(accs[0]["client_id"], accs[0]["username"], accs[0]["password"])
    if not token:
        raise HTTPException(401, "Authentication failed for first account")
    raw = _fetch_ipos_raw(token)
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
        for i in raw
    ]


@app.get("/api/snapshot")
def get_snapshot(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accs = _get_user_accounts_decrypted(current_user, db)
    results = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(_fetch_snapshot_single, acc): acc for acc in accs}
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


@app.get("/api/portfolio")
def get_portfolio(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accs = _get_user_accounts_decrypted(current_user, db)
    results = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(_fetch_portfolio_single, acc): acc for acc in accs}
        for f in as_completed(futures):
            results.append(f.result())
    results.sort(key=lambda x: x.get("username", ""))
    grand_total = sum(r.get("total_value", 0) for r in results)
    return {"accounts": results, "grand_total": grand_total}


class ApplyBody(BaseModel):
    company_id: int
    kitta: int
    account_ids: Optional[List[int]] = None  # None = all accounts


class MultiAllocItem(BaseModel):
    account_id: int
    company_id: int
    kitta: int


class MultiApplyBody(BaseModel):
    allocations: List[MultiAllocItem]


@app.post("/api/apply")
async def apply_bulk(
    body: ApplyBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_accs = _get_user_accounts_decrypted(current_user, db)
    if body.account_ids:
        accs = [a for a in all_accs if a["id"] in body.account_ids]
    else:
        accs = all_accs
    if not accs:
        raise HTTPException(400, "No accounts to apply with")

    # Get IPO name for history logging
    ipo_name, ipo_scrip = None, None
    try:
        token = _auth_raw(accs[0]["client_id"], accs[0]["username"], accs[0]["password"])
        if token:
            raw_ipos = _fetch_ipos_raw(token)
            for i in raw_ipos:
                if i.get("companyShareId") == body.company_id:
                    ipo_name = i.get("companyName")
                    ipo_scrip = i.get("scrip")
                    break
    except Exception:
        pass

    loop = asyncio.get_event_loop()

    async def generate():
        total = len(accs)
        yield json.dumps({"type": "start", "total": total}) + "\n"
        for i, acc in enumerate(accs):
            ms_user = MSUser(
                client_id=acc["client_id"],
                username=acc["username"],
                password=acc["password"],
                crn=acc["crn"],
                pin=int(acc["pin"]),
            )
            result = await loop.run_in_executor(None, _apply_single, ms_user, body.company_id, body.kitta)
            result["company_id"] = body.company_id

            # Log to history
            entry = ApplicationHistory(
                user_id=current_user.id,
                account_username=acc["username"],
                company_id=body.company_id,
                company_name=ipo_name,
                scrip=ipo_scrip,
                kitta=body.kitta,
                status=result.get("status", "failed"),
                error_message=result.get("error_message"),
            )
            db.add(entry)
            db.commit()

            yield json.dumps({"type": "progress", "index": i, "total": total, "result": result}) + "\n"
            await asyncio.sleep(1.0)
        yield json.dumps({"type": "complete"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.post("/api/apply/multi")
async def apply_multi(
    body: MultiApplyBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_accs = {a["id"]: a for a in _get_user_accounts_decrypted(current_user, db)}
    loop = asyncio.get_event_loop()

    async def generate():
        total = len(body.allocations)
        yield json.dumps({"type": "start", "total": total}) + "\n"
        for i, alloc in enumerate(body.allocations):
            acc = all_accs.get(alloc.account_id)
            if not acc:
                yield json.dumps({"type": "progress", "index": i, "total": total,
                    "result": {"user_name": "?", "status": "failed",
                               "error_message": "Account not found",
                               "company_id": alloc.company_id}}) + "\n"
                continue
            ms_user = MSUser(
                client_id=acc["client_id"],
                username=acc["username"],
                password=acc["password"],
                crn=acc["crn"],
                pin=int(acc["pin"]),
            )
            result = await loop.run_in_executor(None, _apply_single, ms_user, alloc.company_id, alloc.kitta)
            result["company_id"] = alloc.company_id

            entry = ApplicationHistory(
                user_id=current_user.id,
                account_username=acc["username"],
                company_id=alloc.company_id,
                company_name=None,
                scrip=None,
                kitta=alloc.kitta,
                status=result.get("status", "failed"),
                error_message=result.get("error_message"),
            )
            db.add(entry)
            db.commit()

            yield json.dumps({"type": "progress", "index": i, "total": total, "result": result}) + "\n"
            await asyncio.sleep(1.0)
        yield json.dumps({"type": "complete"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/api/allotment/check")
async def check_allotment(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check allotment status for all successful applications."""
    accs = _get_user_accounts_decrypted(current_user, db)
    if not accs:
        return {"checked": 0, "allotted": 0}

    pending = db.query(ApplicationHistory).filter(
        ApplicationHistory.user_id == current_user.id,
        ApplicationHistory.status == "success",
        ApplicationHistory.allotment_checked_at == None,  # noqa
    ).all()

    acc_map = {a["username"]: a for a in accs}
    checked, allotted_count = 0, 0

    for entry in pending:
        acc = acc_map.get(entry.account_username)
        if not acc:
            continue
        try:
            token = _auth_raw(acc["client_id"], acc["username"], acc["password"])
            if not token:
                continue
            h = {**JSON_H, "Authorization": token}
            r = req_lib.get(
                f"{BASE}/meroShare/applicantForm/submitted/applicantForm/{entry.company_id}/",
                headers=h, timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                status_name = data.get("statusName", "").lower()
                if "allot" in status_name:
                    allotted_kitta = data.get("appliedKitta", entry.kitta)
                    entry.status = "allotted"
                    entry.allotted_kitta = allotted_kitta
                    allotted_count += 1
                elif "not" in status_name or "reject" in status_name:
                    entry.status = "not_allotted"
                entry.allotment_checked_at = datetime.utcnow()
                checked += 1
        except Exception:
            pass

    db.commit()
    return {"checked": checked, "allotted": allotted_count}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
