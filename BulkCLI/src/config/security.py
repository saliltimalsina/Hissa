"""Central security config — secret sourcing with fail-closed behavior in prod.

Two SEPARATE secrets (never reuse one key for two purposes):
  - JWT_SECRET      : signs/verifies session JWTs
  - ENCRYPTION_KEY  : derives Fernet keys for MeroShare credential encryption

In production (DATABASE_URL set => real deploy) both MUST be provided via env
or the app refuses to start. In local dev (no DATABASE_URL, SQLite fallback)
weak development defaults are allowed but loudly warned.
"""

import os
import sys
import warnings

# A real deploy always has DATABASE_URL (Postgres). Its absence => local dev.
IS_PROD = bool(os.environ.get("DATABASE_URL", "").strip())

# Allow an explicit override for staging/testing against a remote DB locally.
if os.environ.get("APP_ENV", "").lower() in ("dev", "development", "local"):
    IS_PROD = False

_DEV_JWT = "dev-only-jwt-secret-do-not-use-in-prod"
_DEV_ENC = "dev-only-encryption-key-do-not-use-in-prod"


def _require(name: str, dev_default: str) -> str:
    val = os.environ.get(name, "").strip()
    if val:
        return val
    if IS_PROD:
        sys.stderr.write(
            f"\nFATAL: {name} is not set. Refusing to start in production.\n"
            f"Set it as a secret (e.g. `fly secrets set {name}=...`).\n\n"
        )
        raise SystemExit(1)
    warnings.warn(
        f"{name} not set — using INSECURE development default. "
        f"Never run this configuration in production.",
        stacklevel=2,
    )
    return dev_default


JWT_SECRET = _require("JWT_SECRET", _DEV_JWT)
ENCRYPTION_KEY = _require("ENCRYPTION_KEY", _DEV_ENC)

# Cookies must be Secure (HTTPS-only) in prod; relaxed in local http dev.
COOKIE_SECURE = IS_PROD
# SameSite=strict — the frontend and API are same-origin via the Vercel rewrite,
# so strict never breaks our own flows and fully blocks cross-site CSRF.
COOKIE_SAMESITE = "strict"

# Session + reset lifetimes.
JWT_EXPIRE_DAYS = int(os.environ.get("JWT_EXPIRE_DAYS", "7"))
RESET_TOKEN_TTL_MINUTES = int(os.environ.get("RESET_TOKEN_TTL_MINUTES", "60"))

# Public URL of the frontend, used to build password-reset links.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
