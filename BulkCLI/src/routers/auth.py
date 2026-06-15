import os
import hmac
import base64
import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import User, PasswordReset
from src.auth.jwt_handler import get_current_user
from src.auth.session import set_session, clear_session, require_csrf
from src.config.ratelimit import limiter
from src.config.security import FRONTEND_URL, RESET_TOKEN_TTL_MINUTES
from src.services.email_service import send_password_reset

router = APIRouter(prefix="/api/auth", tags=["auth"])

ITERATIONS = 260_000


# ── password hashing ────────────────────────────────────────────────────────
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


def _validate_password(pw: str) -> str:
    if len(pw) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(pw) > 200:
        raise ValueError("Password too long")
    if not any(c.isalpha() for c in pw) or not any(c.isdigit() for c in pw):
        raise ValueError("Password must contain both letters and numbers")
    return pw


# ── schemas ───────────────────────────────────────────────────────────────────
class SignupBody(BaseModel):
    email: EmailStr
    password: str
    name: str = ""

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class UserOut(BaseModel):
    user_id: int
    email: str
    name: str


def _user_out(u: User) -> UserOut:
    return UserOut(user_id=u.id, email=u.email, name=u.name or "")


# ── endpoints ─────────────────────────────────────────────────────────────────
@router.post("/signup", response_model=UserOut)
@limiter.limit("5/minute")
def signup(body: SignupBody, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=email,
        hashed_password=_hash_password(body.password),
        name=(body.name or email.split("@")[0]).strip()[:80],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    set_session(response, user.id)
    return _user_out(user)


@router.post("/login", response_model=UserOut)
@limiter.limit("10/minute")
def login(body: LoginBody, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    set_session(response, user.id)
    return _user_out(user)


@router.post("/logout")
def logout(response: Response):
    clear_session(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(body: ForgotBody, request: Request, db: Session = Depends(get_db)):
    # Always respond identically — never reveal whether an email is registered.
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user:
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        # Invalidate any prior unused tokens for this user.
        db.query(PasswordReset).filter(
            PasswordReset.user_id == user.id,
            PasswordReset.used_at.is_(None),
        ).update({"used_at": datetime.utcnow()})
        db.add(PasswordReset(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
        ))
        db.commit()
        reset_url = f"{FRONTEND_URL}/reset-password?token={raw_token}"
        send_password_reset(user.email, reset_url)
    return {"ok": True, "message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(body: ResetBody, request: Request, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    pr = db.query(PasswordReset).filter(PasswordReset.token_hash == token_hash).first()
    if (
        not pr
        or pr.used_at is not None
        or pr.expires_at < datetime.utcnow()
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    user = db.query(User).filter(User.id == pr.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    user.hashed_password = _hash_password(body.password)
    pr.used_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Password updated. You can now log in."}
