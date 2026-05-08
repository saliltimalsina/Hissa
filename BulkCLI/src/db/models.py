from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from src.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    accounts = relationship("MSAccount", back_populates="owner", cascade="all, delete-orphan")
    history = relationship("ApplicationHistory", back_populates="owner", cascade="all, delete-orphan")
    scheduler_rules = relationship("SchedulerRule", back_populates="owner", cascade="all, delete-orphan")


class MSAccount(Base):
    __tablename__ = "ms_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    username = Column(String, nullable=False)
    enc_password = Column(Text, nullable=False)
    enc_pin = Column(Text, nullable=False)
    enc_crn = Column(Text, nullable=False)
    client_id = Column(Integer, nullable=False)
    label = Column(String, nullable=True)
    group_name = Column(String, nullable=True, default="Default")
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="accounts")


class ApplicationHistory(Base):
    __tablename__ = "application_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_username = Column(String, nullable=False)
    company_id = Column(Integer, nullable=False)
    company_name = Column(String, nullable=True)
    scrip = Column(String, nullable=True)
    kitta = Column(Integer, nullable=False)
    status = Column(String, nullable=False)  # success | failed | allotted | not_allotted
    error_message = Column(Text, nullable=True)
    allotted_kitta = Column(Integer, nullable=True)
    applied_at = Column(DateTime, default=datetime.utcnow)
    allotment_checked_at = Column(DateTime, nullable=True)

    owner = relationship("User", back_populates="history")


class SchedulerRule(Base):
    __tablename__ = "scheduler_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    rule_type = Column(String, nullable=False)  # auto_all | sector_filter
    config_json = Column(Text, nullable=False)  # JSON: {kitta, account_ids, sectors?}
    active = Column(Boolean, default=True)
    last_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="scheduler_rules")
