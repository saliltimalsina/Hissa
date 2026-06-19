import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

# Prefer DATABASE_URL env var (Render Postgres). Fall back to local SQLite.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if DATABASE_URL:
    # Render ships postgres:// — SQLAlchemy 2.x needs postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    # SEC-10: enforce TLS for Postgres (DB holds encrypted MeroShare creds +
    # password hashes). Only inject sslmode if the URL doesn't already set it,
    # to avoid conflicting with an explicit value in the connection string.
    connect_args = {}
    if "sslmode" not in DATABASE_URL:
        connect_args["sslmode"] = "require"
    # Serverless (Vercel Python function): each invocation may run in a fresh,
    # short-lived instance, so a persistent connection pool is worthless and can
    # leave stale/over-limit connections on Neon. NullPool opens a connection per
    # checkout and closes it on return; combine with Neon's POOLED (pgbouncer)
    # endpoint so connection setup stays cheap. pool_pre_ping still guards against
    # a dropped socket on a reused engine within a warm instance.
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args=connect_args,
    )
else:
    DB_PATH = Path(__file__).parent.parent.parent / "data" / "ncap.db"
    DB_PATH.parent.mkdir(exist_ok=True)
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from src.db.models import (  # noqa
        User, MSAccount, ApplicationHistory, SchedulerRule, PasswordReset,
    )
    Base.metadata.create_all(bind=engine)
    migrate()


# Columns added after the production `users` table already existed. create_all
# never ALTERs an existing table, so these must be applied explicitly. Postgres
# supports "ADD COLUMN IF NOT EXISTS", making this fully idempotent.
_USERS_MIGRATIONS = (
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL',
    # Phase 2b — automation engine per-rule safety caps on the existing Neon table.
    'ALTER TABLE scheduler_rules ADD COLUMN IF NOT EXISTS max_accounts INTEGER NOT NULL DEFAULT 50',
    'ALTER TABLE scheduler_rules ADD COLUMN IF NOT EXISTS max_kitta INTEGER NOT NULL DEFAULT 100',
)


def migrate():
    """Idempotent, Postgres-safe column adds for tables that predate new models.

    No-op on SQLite (it lacks "ADD COLUMN IF NOT EXISTS"; fresh SQLite DBs already
    get the columns via create_all). Wrapped so a failure never crashes startup.
    """
    if engine.dialect.name != "postgresql":
        return
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            for stmt in _USERS_MIGRATIONS:
                conn.execute(text(stmt))
    except Exception:
        import sys, traceback
        traceback.print_exc(file=sys.stderr)
