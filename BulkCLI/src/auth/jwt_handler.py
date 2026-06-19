from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import User
from src.config.security import JWT_SECRET, JWT_EXPIRE_DAYS

ALGORITHM = "HS256"
COOKIE_NAME = "hissa_session"


def create_token(user_id: int, token_version: int = 0) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRE_DAYS),
        "type": "session",
        # SEC-03: token_version snapshot — get_current_user rejects the token
        # if the user's current token_version has moved past this value.
        "ver": int(token_version),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[int]:
    """Return the user id from a valid session token, else None.

    (Kept for back-compat / unit tests. get_current_user does its own decode so
    it can also enforce the per-user token_version claim against the DB.)
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "session":
            return None
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


def _decode_payload(token: str) -> Optional[dict]:
    """Decode + validate a session token, returning the full claims dict."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "session":
            return None
        int(payload["sub"])  # ensure sub is an int
        return payload
    except (JWTError, KeyError, ValueError):
        return None


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Resolve the logged-in user from the httpOnly session cookie."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = _decode_payload(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    # SEC-03: a token minted before the last logout/reset carries a stale `ver`.
    if int(payload.get("ver", 0)) != int(user.token_version or 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")
    return user
