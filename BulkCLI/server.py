#!/usr/bin/env python3
"""FastAPI server — Nepal Capital Operating System"""

import sys
import json
import asyncio
from pathlib import Path
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests as req_lib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

from src.models.user import User
from src.models.ipo_application import IPOApplication
from src.services.application_service import ApplicationService
from src.config.settings import get_settings

app = FastAPI(title="Nepal Capital OS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

settings = get_settings()
BASE = settings.API_BASE_URL
JSON_H = {"Accept": "application/json", "Content-Type": "application/json"}


# ── Models ────────────────────────────────────────────────────────────────────

class AccountData(BaseModel):
    client_id: int
    username: str
    password: str
    crn: str
    pin: int
    label: Optional[str] = None
    group: Optional[str] = None

class AccountsBody(BaseModel):
    accounts: List[AccountData]

class ApplyRequest(BaseModel):
    accounts: List[AccountData]
    company_id: int
    kitta: int

class MultiAllocation(BaseModel):
    account_idx: int
    company_id: int
    kitta: int

class MultiApplyRequest(BaseModel):
    accounts: List[AccountData]
    allocations: List[MultiAllocation]


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_user(acc: AccountData) -> User:
    return User(client_id=acc.client_id, username=acc.username,
                password=acc.password, crn=acc.crn, pin=acc.pin)


def auth(acc: AccountData) -> Optional[str]:
    try:
        r = req_lib.post(f"{BASE}/meroShare/auth/",
            json={"clientId": acc.client_id, "username": acc.username, "password": acc.password},
            headers=JSON_H, timeout=12)
    except Exception as e:
        print(f"[AUTH] {acc.username} EXCEPTION: {e}", flush=True)
        return None
    if r.status_code != 200:
        print(f"[AUTH] {acc.username} HTTP {r.status_code}: {r.text[:150]}", flush=True)
        return None
    return r.headers.get("Authorization", "").strip() or None


def apply_single(user: User, company_id: int, kitta: int) -> dict:
    application = IPOApplication(user_id=str(user.client_id), user_name=user.username,
                                  company_id=company_id, kitta_amount=kitta)
    svc = ApplicationService()
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
        print(f"[APPLY] {user.username} ← HTTP {r.status_code}: {r.text[:300]}", flush=True)
        body = {}
        try:
            body = r.json() if isinstance(r.json(), dict) else (r.json()[0] if r.json() else {})
        except Exception:
            pass
        msg = (body.get("message") or body.get("errorMessage") or body.get("error") or "").lower()
        success_signals = ("applied successfully", "share has been applied", "already")
        if r.status_code in (200, 201) or any(s in msg for s in success_signals):
            application.mark_success()
        else:
            err_msg = body.get("message") or body.get("errorMessage") or body.get("error") or f"HTTP {r.status_code}: {r.text[:200]}"
            application.mark_failed(err_msg)
    except Exception as e:
        application.mark_failed(str(e))
    application.increment_attempts()
    return application.to_dict()


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
def get_snapshot(req: AccountsBody):
    """Parallel fetch ownDetail — capped to 2 concurrent to avoid MeroShare auth rate-limit"""
    results = []
    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {ex.submit(_fetch_account_snapshot, acc): acc for acc in req.accounts}
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
def get_portfolio_aggregate(req: AccountsBody):
    """Parallel fetch portfolio — capped to 2 concurrent to avoid MeroShare auth rate-limit"""
    results = []
    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {ex.submit(_fetch_account_portfolio, acc): acc for acc in req.accounts}
        for f in as_completed(futures):
            results.append(f.result())
    results.sort(key=lambda x: x.get("username", ""))
    grand_total = sum(r.get("total_value", 0) for r in results)
    return {"accounts": results, "grand_total": grand_total}


@app.post("/api/ipos")
def get_ipos(req: AccountsBody):
    if not req.accounts:
        raise HTTPException(400, "No accounts provided")
    # Try each account in order until one authenticates successfully
    token = None
    failed_users = []
    for acc in req.accounts:
        token = auth(acc)
        if token:
            break
        failed_users.append(acc.username)
    if not token:
        raise HTTPException(401, f"Authentication failed for all accounts: {', '.join(failed_users)}")
    ipo_payload = {
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
    r = req_lib.post(f"{BASE}/meroShare/companyShare/applicableIssue/",
        json=ipo_payload, headers={**JSON_H, "Authorization": token}, timeout=15)
    if r.status_code != 200:
        return []
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
        for i in r.json().get("object", [])
    ]


@app.post("/api/apply/multi")
async def apply_multi(req: MultiApplyRequest):
    """Stream multi-IPO × multi-account allocation results"""
    loop = asyncio.get_event_loop()

    async def generate():
        total = len(req.allocations)
        yield json.dumps({"type": "start", "total": total}) + "\n"
        for i, alloc in enumerate(req.allocations):
            if alloc.account_idx >= len(req.accounts):
                yield json.dumps({"type": "progress", "index": i, "total": total,
                    "result": {"user_name": "?", "status": "failed",
                               "error_message": "Invalid account index",
                               "company_id": alloc.company_id, "kitta_amount": alloc.kitta}}) + "\n"
                continue
            user = make_user(req.accounts[alloc.account_idx])
            result = await loop.run_in_executor(None, apply_single, user, alloc.company_id, alloc.kitta)
            result["company_id"] = alloc.company_id
            yield json.dumps({"type": "progress", "index": i, "total": total, "result": result}) + "\n"
            await asyncio.sleep(1.0)
        yield json.dumps({"type": "complete"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


# kept for backward compat
@app.post("/api/apply")
async def apply_bulk(req: ApplyRequest):
    users = [make_user(acc) for acc in req.accounts]
    loop = asyncio.get_event_loop()

    async def generate():
        total = len(users)
        yield json.dumps({"type": "start", "total": total}) + "\n"
        for i, user in enumerate(users):
            result = await loop.run_in_executor(None, apply_single, user, req.company_id, req.kitta)
            yield json.dumps({"type": "progress", "index": i, "total": total, "result": result}) + "\n"
            await asyncio.sleep(1.0)
        yield json.dumps({"type": "complete"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/api/brokers")
def get_brokers():
    capitals_path = Path(__file__).parent / "capitals.json"
    with open(capitals_path) as f:
        return json.load(f)


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
        print(f"[REPORTS] {acc.username} ← HTTP {r.status_code}", flush=True)
        if r.status_code != 200:
            return {**base, "error": f"HTTP {r.status_code}: {r.text[:120]}", "applications": []}
        raw = r.json()
        if isinstance(raw, dict):
            apps = raw.get("object") or raw.get("data") or raw.get("result") or []
        elif isinstance(raw, list):
            apps = raw
        else:
            apps = []
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
def get_reports(req: AccountsBody):
    """Serial fetch application reports — MeroShare rate-limits concurrent auths."""
    import time
    results = []
    for acc in req.accounts:
        results.append(_fetch_account_reports(acc))
        time.sleep(0.3)  # small gap to avoid rate limiting
    results.sort(key=lambda x: x.get("username", ""))
    return {"accounts": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
