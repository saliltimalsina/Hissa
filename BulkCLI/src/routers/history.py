from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User, ApplicationHistory
from src.auth.jwt_handler import get_current_user
from src.auth.session import require_csrf

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
def get_history(
    limit: int = Query(200, le=1000),
    offset: int = Query(0),
    status: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(ApplicationHistory).filter(ApplicationHistory.user_id == current_user.id)
    if status:
        q = q.filter(ApplicationHistory.status == status)
    if company_id:
        q = q.filter(ApplicationHistory.company_id == company_id)
    total = q.count()
    rows = q.order_by(ApplicationHistory.applied_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "rows": [
            {
                "id": r.id,
                "account_username": r.account_username,
                "company_id": r.company_id,
                "company_name": r.company_name,
                "scrip": r.scrip,
                "kitta": r.kitta,
                "status": r.status,
                "error_message": r.error_message,
                "allotted_kitta": r.allotted_kitta,
                "applied_at": r.applied_at.isoformat() if r.applied_at else None,
                "allotment_checked_at": r.allotment_checked_at.isoformat() if r.allotment_checked_at else None,
            }
            for r in rows
        ],
    }


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(ApplicationHistory).filter(ApplicationHistory.user_id == current_user.id).all()
    total = len(rows)
    success = sum(1 for r in rows if r.status == "success")
    failed = sum(1 for r in rows if r.status == "failed")
    allotted = sum(1 for r in rows if r.status == "allotted")
    unique_ipos = len(set(r.company_id for r in rows))
    unique_accounts = len(set(r.account_username for r in rows))
    return {
        "total_applications": total,
        "success": success,
        "failed": failed,
        "allotted": allotted,
        "unique_ipos": unique_ipos,
        "unique_accounts": unique_accounts,
        "success_rate": round(success / total * 100, 1) if total else 0,
        "allotment_rate": round(allotted / success * 100, 1) if success else 0,
    }


@router.get("/applied-ipos")
def get_applied_ipos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return set of company_ids this user has applied to, with per-account status."""
    rows = db.query(ApplicationHistory).filter(ApplicationHistory.user_id == current_user.id).all()
    ipos: dict = {}
    for r in rows:
        if r.company_id not in ipos:
            ipos[r.company_id] = {
                "company_id": r.company_id,
                "company_name": r.company_name,
                "scrip": r.scrip,
                "accounts": {},
            }
        ipos[r.company_id]["accounts"][r.account_username] = r.status
    return list(ipos.values())


@router.delete("")
def clear_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    db.query(ApplicationHistory).filter(ApplicationHistory.user_id == current_user.id).delete()
    db.commit()
    return {"ok": True}
