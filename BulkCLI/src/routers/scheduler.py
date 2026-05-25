import json
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User, SchedulerRule
from src.auth.jwt_handler import get_current_user

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


class RuleIn(BaseModel):
    name: str
    rule_type: str  # auto_all | sector_filter
    kitta: int = 10
    sectors: Optional[List[str]] = None
    account_ids: Optional[List[int]] = None  # None = all accounts


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
