"""Memory sync router — push/pull with field-level merge."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import SyncedMemory

router = APIRouter(prefix="/sync/memory", tags=["sync"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MemoryPushRequest(BaseModel):
    agent_name: str = "_default"
    data: dict
    updated_at: str  # ISO timestamp


class MemoryPullResponse(BaseModel):
    data: dict | None
    version: int
    updated_at: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/push")
async def push_memory(req: MemoryPushRequest, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Push memory to cloud with field-level merge."""
    user_id = current_user["sub"]

    result = await db.execute(
        select(SyncedMemory).where(SyncedMemory.user_id == user_id, SyncedMemory.agent_name == req.agent_name)
    )
    row = result.scalar_one_or_none()

    if row is None:
        row = SyncedMemory(user_id=user_id, agent_name=req.agent_name, data=req.data, version=1)
        db.add(row)
    else:
        merged = _merge_memory(row.data or {}, req.data)
        row.data = merged
        row.version += 1

    await db.commit()
    await db.refresh(row)
    return {"status": "ok", "version": row.version}


@router.get("/pull", response_model=MemoryPullResponse)
async def pull_memory(agent_name: str = "_default", current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Pull memory from cloud."""
    user_id = current_user["sub"]

    result = await db.execute(
        select(SyncedMemory).where(SyncedMemory.user_id == user_id, SyncedMemory.agent_name == agent_name)
    )
    row = result.scalar_one_or_none()
    if not row:
        return MemoryPullResponse(data=None, version=0)
    return MemoryPullResponse(
        data=row.data,
        version=row.version,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


# ---------------------------------------------------------------------------
# Field-level merge
# ---------------------------------------------------------------------------

def _merge_memory(cloud: dict, local: dict) -> dict:
    """Merge local memory into cloud memory at field level.

    Strategy:
    - user.* / history.* sections: take the one with newer updatedAt
    - facts[]: merge by id, keep higher confidence, skip tombstoned
    - lastUpdated: take the newer one
    """
    merged = dict(cloud)

    # Merge user.* and history.* sections
    for section in ("user", "history"):
        if section not in local:
            continue
        if section not in merged:
            merged[section] = {}
        for key, val in local[section].items():
            cloud_val = merged[section].get(key, {})
            local_updated = val.get("updatedAt", "")
            cloud_updated = cloud_val.get("updatedAt", "") if isinstance(cloud_val, dict) else ""
            if local_updated >= cloud_updated:
                merged[section][key] = val

    # Merge facts by id
    cloud_facts = {f["id"]: f for f in merged.get("facts", []) if isinstance(f, dict) and "id" in f}
    for fact in local.get("facts", []):
        if not isinstance(fact, dict) or "id" not in fact:
            continue
        fid = fact["id"]
        if fact.get("deletedAt"):
            # Tombstone: mark for deletion
            cloud_facts.pop(fid, None)
            continue
        if fid in cloud_facts:
            # Both have it: keep higher confidence
            if fact.get("confidence", 0) >= cloud_facts[fid].get("confidence", 0):
                cloud_facts[fid] = fact
        else:
            cloud_facts[fid] = fact

    merged["facts"] = [f for f in cloud_facts.values() if not f.get("deletedAt")]
    merged["lastUpdated"] = max(cloud.get("lastUpdated", ""), local.get("lastUpdated", ""))
    merged["version"] = cloud.get("version", "1.0")

    return merged
