"""Shared rate limiter (slowapi). Keyed by client IP.

Import `limiter` in routers and decorate sensitive endpoints, e.g.:
    @limiter.limit("5/minute")
    def login(request: Request, ...): ...

server.py registers the limiter on the app and installs the 429 handler.
Behind Vercel/Fly the real client IP arrives via the trusted `Fly-Client-IP`
header; we key on that. We deliberately do NOT trust X-Forwarded-For.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _client_key(request: Request) -> str:
    # Trusted-proxy assumption: deployed behind Fly (Vercel rewrites /api -> Fly).
    # Fly sets `Fly-Client-IP` to the real client IP at its edge; an external
    # attacker hitting the Fly origin cannot forge this header to Fly. We must
    # NOT trust the left-most (or any) client-supplied X-Forwarded-For value,
    # since rotating it per request would mint a fresh rate-limit bucket and
    # defeat the per-IP brute-force protection on auth endpoints.
    fly_ip = request.headers.get("fly-client-ip")
    if fly_ip:
        return fly_ip.strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_key, default_limits=[])
