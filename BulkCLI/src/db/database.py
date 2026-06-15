import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Prefer DATABASE_URL env var (Render Postgres). Fall back to local SQLite.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if DATABASE_URL:
    # Render ships postgres:// — SQLAlchemy 2.x needs postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
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
