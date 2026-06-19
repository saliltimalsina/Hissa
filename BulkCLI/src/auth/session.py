"""Session cookie + CSRF helpers.

Auth token lives in an httpOnly cookie (unreadable by JS => XSS-safe). CSRF is
defended two ways: SameSite=strict on the session cookie, plus a double-submit
token (a non-httpOnly `hissa_csrf` cookie the frontend echoes in the
`X-CSRF-Token` header on every mutating request).
"""

import secrets

from fastapi import Request, HTTPException, status, Response

from src.config.security import COOKIE_SECURE, COOKIE_SAMESITE, JWT_EXPIRE_DAYS
from src.auth.jwt_handler import create_token, COOKIE_NAME

CSRF_COOKIE = "hissa_csrf"
CSRF_HEADER = "x-csrf-token"
_MAX_AGE = JWT_EXPIRE_DAYS * 24 * 3600


def set_session(response: Response, user_id: int, token_version: int = 0) -> None:
    """Issue session + CSRF cookies after login/signup."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_token(user_id, token_version),
        max_age=_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=secrets.token_urlsafe(32),
        max_age=_MAX_AGE,
        httponly=False,  # frontend must read this to echo in the header
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


def require_csrf(request: Request) -> None:
    """Dependency for mutating endpoints: header token must match cookie token."""
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    if not cookie or not header or not secrets.compare_digest(cookie, header):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")
