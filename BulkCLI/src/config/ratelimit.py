"""Shared rate limiter (slowapi). Keyed by client IP.

Import `limiter` in routers and decorate sensitive endpoints, e.g.:
    @limiter.limit("5/minute")
    def login(request: Request, ...): ...

server.py registers the limiter on the app and installs the 429 handler.
Behind Vercel/Fly the real client IP arrives in X-Forwarded-For; we key on that.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_key, default_limits=[])
