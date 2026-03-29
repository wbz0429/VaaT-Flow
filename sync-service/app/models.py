"""Database models for the VaaT-Flow Sync Service."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, default="")
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="user")  # "admin" | "user"
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    name = Column(String(255), nullable=False, default="Unknown Device")
    platform = Column(String(64), nullable=False, default="unknown")  # "macos" | "windows" | "linux"
    last_sync_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Model Configuration (admin-managed)
# ---------------------------------------------------------------------------

class ModelConfig(Base):
    """LLM model configurations managed by admin, pulled by clients on login."""
    __tablename__ = "model_configs"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="")
    # LangChain class path, e.g. "langchain_openai:ChatOpenAI"
    use_class = Column(String(512), nullable=False)
    # Actual model identifier, e.g. "gpt-4o"
    model = Column(String(255), nullable=False)
    # Provider API base URL (optional, for OpenAI-compatible providers)
    api_base = Column(String(1024))
    # API key — AES-256 encrypted at rest, decrypted when sent to client
    api_key_encrypted = Column(Text)
    # Model capabilities
    supports_thinking = Column(Boolean, nullable=False, default=False)
    supports_vision = Column(Boolean, nullable=False, default=False)
    supports_reasoning_effort = Column(Boolean, nullable=False, default=False)
    # Extra config fields as JSON (max_tokens, temperature, when_thinking_enabled, etc.)
    extra_config = Column(JSON, nullable=False, default=dict)
    # Admin controls
    enabled = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ---------------------------------------------------------------------------
# Synced Checkpoints (mirrors LangGraph checkpoint tables)
# ---------------------------------------------------------------------------

class SyncedCheckpoint(Base):
    __tablename__ = "synced_checkpoints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), nullable=False)
    thread_id = Column(String(64), nullable=False)
    checkpoint_ns = Column(Text, nullable=False, default="")
    checkpoint_id = Column(String(64), nullable=False)
    parent_checkpoint_id = Column(String(64))
    type = Column(Text)
    checkpoint = Column(LargeBinary)
    metadata_ = Column("metadata", LargeBinary)
    synced_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("uq_synced_checkpoints", "user_id", "thread_id", "checkpoint_ns", "checkpoint_id", unique=True),
        Index("ix_synced_checkpoints_user_thread", "user_id", "thread_id"),
    )


class SyncedWrite(Base):
    __tablename__ = "synced_writes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), nullable=False)
    thread_id = Column(String(64), nullable=False)
    checkpoint_ns = Column(Text, nullable=False, default="")
    checkpoint_id = Column(String(64), nullable=False)
    task_id = Column(String(64), nullable=False)
    idx = Column(Integer, nullable=False)
    channel = Column(Text, nullable=False)
    type = Column(Text)
    value = Column(LargeBinary)

    __table_args__ = (
        Index("uq_synced_writes", "user_id", "thread_id", "checkpoint_ns", "checkpoint_id", "task_id", "idx", unique=True),
    )


# ---------------------------------------------------------------------------
# Synced Memory
# ---------------------------------------------------------------------------

class SyncedMemory(Base):
    __tablename__ = "synced_memory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), nullable=False)
    agent_name = Column(String(255), nullable=False, default="_default")
    data = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    version = Column(Integer, nullable=False, default=1)

    __table_args__ = (
        Index("uq_synced_memory", "user_id", "agent_name", unique=True),
    )


# ---------------------------------------------------------------------------
# Synced Settings (user preferences)
# ---------------------------------------------------------------------------

class SyncedSettings(Base):
    __tablename__ = "synced_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), nullable=False)
    key = Column(String(255), nullable=False)
    value = Column(JSON)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("uq_synced_settings", "user_id", "key", unique=True),
    )
