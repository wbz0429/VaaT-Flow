"""Appliance first-run setup wizard API.

Provides endpoints for the initial setup flow: creating the first admin user,
configuring model providers, and marking setup as complete. All POST endpoints
are guarded to prevent re-execution after setup is finished.
"""

import hashlib
import json
import logging
import os
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.gateway.db.database import get_db_session
from app.gateway.db.models import ApplianceSettings, Organization, OrganizationMember

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/setup", tags=["setup"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class SetupStatusResponse(BaseModel):
    """GET /api/setup/status response."""

    setup_completed: bool


class CreateAdminRequest(BaseModel):
    """POST /api/setup/admin request body."""

    email: str = Field(..., description="Admin user email address")
    password: str = Field(..., min_length=8, description="Admin user password")
    name: str = Field(..., description="Admin user display name")


class CreateAdminResponse(BaseModel):
    """POST /api/setup/admin response."""

    success: bool
    user_id: str
    org_id: str
    session_token: str


class ModelProviderConfig(BaseModel):
    """A single model provider with its API key and available models."""

    provider: str = Field(..., description="Provider name (e.g. 'openai', 'anthropic')")
    api_key: str = Field(..., description="API key for this provider")
    models: list[dict] = Field(default_factory=list, description="List of model objects with 'name' and 'display_name'")


class SaveModelsRequest(BaseModel):
    """POST /api/setup/models request body."""

    providers: list[ModelProviderConfig] = Field(..., description="List of model provider configurations")


class SaveModelsResponse(BaseModel):
    """POST /api/setup/models response."""

    success: bool
    model_count: int


class SetupCompleteResponse(BaseModel):
    """POST /api/setup/complete response."""

    success: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    """Fetch a single appliance setting value by key.

    Args:
        db: Async database session.
        key: The setting key to look up.

    Returns:
        The setting value string, or None if the key does not exist.
    """
    result = await db.execute(select(ApplianceSettings).where(ApplianceSettings.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def _set_setting(db: AsyncSession, key: str, value: str) -> None:
    """Create or update an appliance setting.

    Args:
        db: Async database session.
        key: The setting key.
        value: The setting value to store.
    """
    result = await db.execute(select(ApplianceSettings).where(ApplianceSettings.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(ApplianceSettings(key=key, value=value))
    await db.commit()


def _hash_password(password: str) -> str:
    """Hash a password using scrypt with a random salt.

    Returns the hash as ``salt_hex:hash_hex`` matching the Better Auth
    credential format used by the frontend local-dev pattern.

    Args:
        password: The plaintext password.

    Returns:
        A string in the format ``salt:hash`` (both hex-encoded).
    """
    salt = os.urandom(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f"{salt.hex()}:{derived.hex()}"


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


async def _require_setup_incomplete(db: AsyncSession = Depends(get_db_session)) -> AsyncSession:
    """FastAPI dependency that rejects requests when setup is already completed.

    Args:
        db: Async database session (injected).

    Returns:
        The database session for downstream use.

    Raises:
        HTTPException: 403 if ``setup_completed`` is already ``"true"``.
    """
    value = await _get_setting(db, "setup_completed")
    if value == "true":
        raise HTTPException(status_code=403, detail="Setup has already been completed")
    return db


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/status",
    response_model=SetupStatusResponse,
    summary="Get Setup Status",
    description="Check whether the appliance first-run setup has been completed.",
)
async def get_setup_status(
    db: AsyncSession = Depends(get_db_session),
) -> SetupStatusResponse:
    """Return whether the initial setup wizard has been completed."""
    value = await _get_setting(db, "setup_completed")
    return SetupStatusResponse(setup_completed=(value == "true"))


@router.post(
    "/admin",
    response_model=CreateAdminResponse,
    summary="Create First Admin",
    description="Create the first admin user and default organization. Only works before setup is completed.",
)
async def create_admin(
    request: CreateAdminRequest,
    db: AsyncSession = Depends(_require_setup_incomplete),
) -> CreateAdminResponse:
    """Create the initial admin user, default org, and a login session.

    Inserts directly into Better Auth's ``user``, ``account``, and ``session``
    tables via raw SQL since those tables are not managed by our ORM.
    """
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    session_token = secrets.token_hex(32)
    hashed_password = _hash_password(request.password)

    # 1. Create default organization
    org = Organization(id=org_id, name="Default", slug="default")
    db.add(org)
    await db.flush()

    # 2. Create user in Better Auth's user table (raw SQL)
    await db.execute(
        text('INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") VALUES (:id, :name, :email, true, \'\', now(), now())'),
        {"id": user_id, "name": request.name, "email": request.email},
    )

    # 3. Create account (credential provider)
    await db.execute(
        text('INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES (:id, :account_id, \'credential\', :user_id, :hashed_password, now(), now())'),
        {"id": account_id, "account_id": user_id, "user_id": user_id, "hashed_password": hashed_password},
    )

    # 4. Link user to org as admin
    member = OrganizationMember(org_id=org_id, user_id=user_id, role="admin")
    db.add(member)

    # 5. Create session in Better Auth's session table
    await db.execute(
        text('INSERT INTO session (id, "userId", token, "expiresAt", "ipAddress", "userAgent", "createdAt", "updatedAt") VALUES (:id, :user_id, :token, now() + interval \'30 days\', \'\', \'\', now(), now())'),
        {"id": session_id, "user_id": user_id, "token": session_token},
    )

    await db.commit()
    logger.info("Setup: created admin user_id=%s org_id=%s email=%s", user_id, org_id, request.email)

    return CreateAdminResponse(success=True, user_id=user_id, org_id=org_id, session_token=session_token)


@router.post(
    "/models",
    response_model=SaveModelsResponse,
    summary="Save Model Providers",
    description="Save model provider configuration during setup. Only works before setup is completed.",
)
async def save_models(
    request: SaveModelsRequest,
    db: AsyncSession = Depends(_require_setup_incomplete),
) -> SaveModelsResponse:
    """Persist model provider config to appliance settings."""
    providers_json = json.dumps([p.model_dump() for p in request.providers], ensure_ascii=False)
    await _set_setting(db, "model_providers", providers_json)

    # Set default model to the first model of the first provider
    model_count = 0
    default_model: str | None = None
    for provider in request.providers:
        for m in provider.models:
            model_count += 1
            if default_model is None:
                default_model = m.get("name", "")

    if default_model:
        await _set_setting(db, "default_model", default_model)

    logger.info("Setup: saved %d model(s) across %d provider(s), default=%s", model_count, len(request.providers), default_model)
    return SaveModelsResponse(success=True, model_count=model_count)


@router.post(
    "/complete",
    response_model=SetupCompleteResponse,
    summary="Complete Setup",
    description="Mark the appliance setup as completed and trigger config generation. Only works once.",
)
async def complete_setup(
    db: AsyncSession = Depends(_require_setup_incomplete),
) -> SetupCompleteResponse:
    """Mark setup as done and optionally render runtime config files."""
    await _set_setting(db, "setup_completed", "true")
    logger.info("Setup: marked as completed")

    # Trigger config renderer if available (may not exist yet)
    try:
        from app.gateway.services.config_renderer import render_appliance_config

        await render_appliance_config(db)
        logger.info("Setup: config renderer executed successfully")
    except ImportError:
        logger.warning("Setup: config_renderer service not available yet, skipping runtime config generation")
    except Exception:
        logger.exception("Setup: config renderer failed (non-fatal)")

    return SetupCompleteResponse(success=True)
