from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User, MSAccount
from src.auth.jwt_handler import get_current_user
from src.auth.session import require_csrf
from src.auth.crypto import encrypt, decrypt

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class AccountIn(BaseModel):
    username: str
    password: str
    pin: str
    crn: str
    client_id: int
    label: Optional[str] = None
    group_name: Optional[str] = "Default"


class AccountUpdate(BaseModel):
    label: Optional[str] = None
    group_name: Optional[str] = None
    password: Optional[str] = None
    pin: Optional[str] = None
    crn: Optional[str] = None
    client_id: Optional[int] = None


class AccountOut(BaseModel):
    id: int
    username: str
    client_id: int
    label: Optional[str]
    group_name: Optional[str]

    class Config:
        from_attributes = True


class BulkImportRow(BaseModel):
    client_id: int
    username: str
    password: str
    crn: str
    pin: str
    label: Optional[str] = None
    group_name: Optional[str] = "Default"


def _to_out(acc: MSAccount) -> dict:
    return {
        "id": acc.id,
        "username": acc.username,
        "client_id": acc.client_id,
        "label": acc.label,
        "group_name": acc.group_name,
        "created_at": acc.created_at.isoformat() if acc.created_at else None,
    }


def _decrypt_account(acc: MSAccount, user_id: int) -> dict:
    """Return account with decrypted credentials for API use."""
    return {
        "id": acc.id,
        "username": acc.username,
        "client_id": acc.client_id,
        "label": acc.label,
        "group_name": acc.group_name,
        "password": decrypt(acc.enc_password, user_id),
        "pin": decrypt(acc.enc_pin, user_id),
        "crn": decrypt(acc.enc_crn, user_id),
    }


@router.get("")
def list_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accs = db.query(MSAccount).filter(MSAccount.user_id == current_user.id).all()
    return [_to_out(a) for a in accs]


@router.post("")
def add_account(
    body: AccountIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    existing = db.query(MSAccount).filter(
        MSAccount.user_id == current_user.id,
        MSAccount.username == body.username,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Account '{body.username}' already exists")
    acc = MSAccount(
        user_id=current_user.id,
        username=body.username,
        enc_password=encrypt(body.password, current_user.id),
        enc_pin=encrypt(str(body.pin), current_user.id),
        enc_crn=encrypt(body.crn, current_user.id),
        client_id=body.client_id,
        label=body.label or body.username,
        group_name=body.group_name or "Default",
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return _to_out(acc)


@router.put("/{account_id}")
def update_account(
    account_id: int,
    body: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    acc = db.query(MSAccount).filter(
        MSAccount.id == account_id,
        MSAccount.user_id == current_user.id,
    ).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    if body.label is not None:
        acc.label = body.label
    if body.group_name is not None:
        acc.group_name = body.group_name
    if body.client_id is not None:
        acc.client_id = body.client_id
    if body.password:
        acc.enc_password = encrypt(body.password, current_user.id)
    if body.pin:
        acc.enc_pin = encrypt(str(body.pin), current_user.id)
    if body.crn:
        acc.enc_crn = encrypt(body.crn, current_user.id)
    db.commit()
    db.refresh(acc)
    return _to_out(acc)


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    acc = db.query(MSAccount).filter(
        MSAccount.id == account_id,
        MSAccount.user_id == current_user.id,
    ).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(acc)
    db.commit()
    return {"ok": True}


@router.post("/import")
def bulk_import(
    rows: List[BulkImportRow],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    added, skipped = 0, 0
    for row in rows:
        existing = db.query(MSAccount).filter(
            MSAccount.user_id == current_user.id,
            MSAccount.username == row.username,
        ).first()
        if existing:
            skipped += 1
            continue
        acc = MSAccount(
            user_id=current_user.id,
            username=row.username,
            enc_password=encrypt(row.password, current_user.id),
            enc_pin=encrypt(str(row.pin), current_user.id),
            enc_crn=encrypt(row.crn, current_user.id),
            client_id=row.client_id,
            label=row.label or row.username,
            group_name=row.group_name or "Default",
        )
        db.add(acc)
        added += 1
    db.commit()
    return {"added": added, "skipped": skipped}


def get_decrypted_accounts(user: User, db: Session) -> list:
    """Helper used by other routers to get user accounts with decrypted creds."""
    accs = db.query(MSAccount).filter(MSAccount.user_id == user.id).all()
    return [_decrypt_account(a, user.id) for a in accs]
