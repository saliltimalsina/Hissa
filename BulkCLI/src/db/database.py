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
