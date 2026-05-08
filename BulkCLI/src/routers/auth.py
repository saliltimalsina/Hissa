import hashlib
import hmac
import os
import base64
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User
from src.auth.jwt_handler import create_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

ITERATIONS = 260_000


def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return base64.b64encode(salt + dk).decode()


def _verify_password(password: str, stored: str) -> bool:
    try:
        raw = base64.b64decode(stored.encode())
        salt, dk = raw[:16], raw[16:]
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
        return hmac.compare_digest(dk, test)
    except Exception:
        return False


class SignupBody(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginBody(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user_id: int
    email: str
    name: str


@router.post("/signup", response_model=TokenResponse)
def signup(body: SignupBody, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=body.email.lower(),
        hashed_password=_hash_password(body.password),
        name=body.name or body.email.split("@")[0],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(
        token=create_token(user.id),
        user_id=user.id,
        email=user.email,
        name=user.name or "",
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(
        token=create_token(user.id),
        user_id=user.id,
        email=user.email,
        name=user.name or "",
    )


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"user_id": current_user.id, "email": current_user.email, "name": current_user.name}
