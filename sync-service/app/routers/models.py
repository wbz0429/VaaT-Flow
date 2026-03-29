"""Admin model config router — CRUD for LLM model configurations."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_admin
from app.crypto import decrypt_api_key, encrypt_api_key
from app.database import get_db
from app.models import ModelConfig

router = APIRouter(tags=["models"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ModelConfigCreate(BaseModel):
    name: str
    display_name: str
    description: str = ""
    use_class: str  # e.g. "langchain_openai:ChatOpenAI"
    model: str  # e.g. "gpt-4o"
    api_base: str | None = None
    api_key: str | None = None  # plaintext, encrypted before storage
    supports_thinking: bool = False
    supports_vision: bool = False
    supports_reasoning_effort: bool = False
    extra_config: dict = {}
    enabled: bool = True
    sort_order: int = 0


class ModelConfigUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    use_class: str | None = None
    model: str | None = None
    api_base: str | None = None
    api_key: str | None = None
    supports_thinking: bool | None = None
    supports_vision: bool | None = None
    supports_reasoning_effort: bool | None = None
    extra_config: dict | None = None
    enabled: bool | None = None
    sort_order: int | None = None


class ModelConfigResponse(BaseModel):
    id: str
    name: str
    display_name: str
    description: str
    use_class: str
    model: str
    api_base: str | None
    has_api_key: bool
    supports_thinking: bool
    supports_vision: bool
    supports_reasoning_effort: bool
    extra_config: dict
    enabled: bool
    sort_order: int


class ClientModelConfig(BaseModel):
    """Model config as seen by desktop clients — includes decrypted api_key."""
    name: str
    display_name: str
    description: str
    use_class: str
    model: str
    api_base: str | None
    api_key: str | None
    supports_thinking: bool
    supports_vision: bool
    supports_reasoning_effort: bool
    extra_config: dict


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/models", response_model=list[ModelConfigResponse])
async def list_models(admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ModelConfig).order_by(ModelConfig.sort_order, ModelConfig.name))
    models = result.scalars().all()
    return [_to_response(m) for m in models]


@router.post("/admin/models", response_model=ModelConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_model(req: ModelConfigCreate, admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(ModelConfig).where(ModelConfig.name == req.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Model '{req.name}' already exists")

    mc = ModelConfig(
        id=str(uuid.uuid4()),
        name=req.name,
        display_name=req.display_name,
        description=req.description,
        use_class=req.use_class,
        model=req.model,
        api_base=req.api_base,
        api_key_encrypted=encrypt_api_key(req.api_key) if req.api_key else None,
        supports_thinking=req.supports_thinking,
        supports_vision=req.supports_vision,
        supports_reasoning_effort=req.supports_reasoning_effort,
        extra_config=req.extra_config,
        enabled=req.enabled,
        sort_order=req.sort_order,
    )
    db.add(mc)
    await db.commit()
    await db.refresh(mc)
    return _to_response(mc)


@router.put("/admin/models/{model_id}", response_model=ModelConfigResponse)
async def update_model(model_id: str, req: ModelConfigUpdate, admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
    mc = result.scalar_one_or_none()
    if not mc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    for field, value in req.model_dump(exclude_unset=True).items():
        if field == "api_key" and value is not None:
            mc.api_key_encrypted = encrypt_api_key(value)
        elif field != "api_key":
            setattr(mc, field, value)

    await db.commit()
    await db.refresh(mc)
    return _to_response(mc)


@router.delete("/admin/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(model_id: str, admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
    mc = result.scalar_one_or_none()
    if not mc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    await db.delete(mc)
    await db.commit()


# ---------------------------------------------------------------------------
# Client endpoint — desktop apps pull this on login
# ---------------------------------------------------------------------------

@router.get("/client/models", response_model=list[ClientModelConfig])
async def get_client_models(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Return enabled models with decrypted API keys for desktop client use."""
    result = await db.execute(
        select(ModelConfig).where(ModelConfig.enabled == True).order_by(ModelConfig.sort_order, ModelConfig.name)  # noqa: E712
    )
    models = result.scalars().all()
    return [_to_client_config(m) for m in models]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_response(mc: ModelConfig) -> ModelConfigResponse:
    return ModelConfigResponse(
        id=mc.id,
        name=mc.name,
        display_name=mc.display_name,
        description=mc.description or "",
        use_class=mc.use_class,
        model=mc.model,
        api_base=mc.api_base,
        has_api_key=mc.api_key_encrypted is not None,
        supports_thinking=mc.supports_thinking,
        supports_vision=mc.supports_vision,
        supports_reasoning_effort=mc.supports_reasoning_effort,
        extra_config=mc.extra_config or {},
        enabled=mc.enabled,
        sort_order=mc.sort_order,
    )


def _to_client_config(mc: ModelConfig) -> ClientModelConfig:
    api_key = None
    if mc.api_key_encrypted:
        try:
            api_key = decrypt_api_key(mc.api_key_encrypted)
        except Exception:
            pass  # graceful degradation if decryption fails
    return ClientModelConfig(
        name=mc.name,
        display_name=mc.display_name,
        description=mc.description or "",
        use_class=mc.use_class,
        model=mc.model,
        api_base=mc.api_base,
        api_key=api_key,
        supports_thinking=mc.supports_thinking,
        supports_vision=mc.supports_vision,
        supports_reasoning_effort=mc.supports_reasoning_effort,
        extra_config=mc.extra_config or {},
    )
