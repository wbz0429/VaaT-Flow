"""Settings sync router — simple key-value last-write-wins."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import SyncedSettings

router = APIRouter(prefix="/sync/settings", tags=["sync"])


class SettingItem(BaseModel):
    key: str
    value: dict | list | str | int | float | bool | None


class SettingsPushRequest(BaseModel):
    settings: list[SettingItem]


@router.put("")
async def push_settings(req: SettingsPushRequest, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Push user settings to cloud (last-write-wins)."""
    user_id = current_user["sub"]

    for item in req.settings:
        result = await db.execute(
            select(SyncedSettings).where(SyncedSettings.user_id == user_id, SyncedSettings.key == item.key)
        )
        row = result.scalar_one_or_none()
        if row:
            row.value = item.value
        else:
            db.add(SyncedSettings(user_id=user_id, key=item.key, value=item.value))

    await db.commit()
    return {"status": "ok", "count": len(req.settings)}


@router.get("")
async def pull_settings(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Pull all user settings from cloud."""
    user_id = current_user["sub"]

    result = await db.execute(select(SyncedSettings).where(SyncedSettings.user_id == user_id))
    rows = result.scalars().all()
    return {"settings": {row.key: row.value for row in rows}}
