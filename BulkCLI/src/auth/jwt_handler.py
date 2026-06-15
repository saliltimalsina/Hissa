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


def create_token(user_id: int) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRE_DAYS),
        "type": "session",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "session":
            return None
        return int(payload["sub"])
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
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
