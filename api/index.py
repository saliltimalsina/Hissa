"""Vercel Python function entry point for the Hissa FastAPI backend.

Vercel maps `api/index.py` to the serverless function and looks for a module-level
ASGI `app`. The actual application lives in `BulkCLI/server.py`, so we put the
`BulkCLI` directory on sys.path (robustly, off this file's location rather than
the CWD, which Vercel does not guarantee) and re-export its `app`.

`server.py` itself inserts `BulkCLI/src` onto sys.path and imports `from src.* ...`,
so `BulkCLI` must be importable as a path root. The root `vercel.json` uses
`includeFiles` to bundle `BulkCLI/**` (server.py + src/ + capitals.json) alongside
this function.
"""

import sys
from pathlib import Path

# .../repo-root/api/index.py -> repo root is parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[1]
_BULKCLI = _REPO_ROOT / "BulkCLI"

# Prepend BulkCLI so `import server` and `import src.*` resolve exactly as they
# do at runtime locally (server.py also inserts its own src/ path on import).
if str(_BULKCLI) not in sys.path:
    sys.path.insert(0, str(_BULKCLI))

from server import app  # noqa: E402  (path setup must precede this import)

# Expose `app` as the ASGI handler Vercel's Python runtime invokes.
__all__ = ["app"]
