"""Shared rate limiter (slowapi). Keyed by client IP.

Import `limiter` in routers and decorate sensitive endpoints, e.g.:
    @limiter.limit("5/minute")
    def login(request: Request, ...): ...

server.py registers the limiter on the app and installs the 429 handler.
Behind Vercel the real client IP arrives via the trusted `x-real-ip` header
(set by Vercel's edge); we key on that. We deliberately do NOT trust the raw
client-supplied X-Forwarded-For.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _client_key(request: Request) -> str:
    # Trusted-proxy assumption: deployed behind Vercel (FastAPI runs as a Vercel
    # Python function, same origin as the SPA). Vercel's edge sets `x-real-ip` to
    # the real client IP; an external attacker hitting the function cannot forge
    # what Vercel injects. As a fallback we take the FIRST hop of Vercel's
    # `x-vercel-forwarded-for` (Vercel-prepended, left-most = real client). We
    # must NOT trust a raw client-supplied X-Forwarded-For value, since rotating
    # it per request would mint a fresh rate-limit bucket and defeat the per-IP
    # brute-force protection on auth endpoints.
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    vercel_ff = request.headers.get("x-vercel-forwarded-for")
    if vercel_ff:
        return vercel_ff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_key, default_limits=[])
