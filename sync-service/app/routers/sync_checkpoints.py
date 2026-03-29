"""Checkpoint sync router — push/pull LangGraph checkpoints between client and cloud."""

import base64

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import SyncedCheckpoint, SyncedWrite

router = APIRouter(prefix="/sync/checkpoints", tags=["sync"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CheckpointItem(BaseModel):
    checkpoint_id: str
    parent_checkpoint_id: str | None = None
    checkpoint_ns: str = ""
    type: str | None = None
    checkpoint: str  # base64-encoded blob
    metadata: str = ""  # base64-encoded blob


class WriteItem(BaseModel):
    checkpoint_id: str
    checkpoint_ns: str = ""
    task_id: str
    idx: int
    channel: str
    type: str | None = None
    value: str = ""  # base64-encoded blob


class PushRequest(BaseModel):
    thread_id: str
    checkpoints: list[CheckpointItem]
    writes: list[WriteItem] = []


class PullRequest(BaseModel):
    thread_id: str
    latest_checkpoint_id: str | None = None  # None = full pull


class ThreadListRequest(BaseModel):
    since: str | None = None  # ISO timestamp


class ThreadSummary(BaseModel):
    thread_id: str
    last_synced: str
    checkpoint_count: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/push")
async def push_checkpoints(req: PushRequest, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Client pushes new checkpoints to cloud. Idempotent (on_conflict_do_nothing)."""
    user_id = current_user["sub"]
    synced_cp = 0
    synced_w = 0

    for cp in req.checkpoints:
        try:
            cp_blob = base64.b64decode(cp.checkpoint) if cp.checkpoint else b""
            meta_blob = base64.b64decode(cp.metadata) if cp.metadata else b""
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid base64 in checkpoint {cp.checkpoint_id}")

        stmt = insert(SyncedCheckpoint).values(
            user_id=user_id,
            thread_id=req.thread_id,
            checkpoint_ns=cp.checkpoint_ns,
            checkpoint_id=cp.checkpoint_id,
            parent_checkpoint_id=cp.parent_checkpoint_id,
            type=cp.type,
            checkpoint=cp_blob,
            metadata_=meta_blob,
        )
        # PostgreSQL upsert: skip if already exists
        stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "thread_id", "checkpoint_ns", "checkpoint_id"])
        result = await db.execute(stmt)
        if result.rowcount > 0:
            synced_cp += 1

    for w in req.writes:
        try:
            val_blob = base64.b64decode(w.value) if w.value else b""
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid base64 in write {w.checkpoint_id}:{w.task_id}:{w.idx}")

        stmt = insert(SyncedWrite).values(
            user_id=user_id,
            thread_id=req.thread_id,
            checkpoint_ns=w.checkpoint_ns,
            checkpoint_id=w.checkpoint_id,
            task_id=w.task_id,
            idx=w.idx,
            channel=w.channel,
            type=w.type,
            value=val_blob,
        )
        stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "thread_id", "checkpoint_ns", "checkpoint_id", "task_id", "idx"])
        result = await db.execute(stmt)
        if result.rowcount > 0:
            synced_w += 1

    await db.commit()
    return {"status": "ok", "synced_checkpoints": synced_cp, "synced_writes": synced_w}


@router.post("/pull")
async def pull_checkpoints(req: PullRequest, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Client pulls missing checkpoints from cloud."""
    user_id = current_user["sub"]

    query = select(SyncedCheckpoint).where(
        SyncedCheckpoint.user_id == user_id,
        SyncedCheckpoint.thread_id == req.thread_id,
    )
    if req.latest_checkpoint_id:
        query = query.where(SyncedCheckpoint.checkpoint_id > req.latest_checkpoint_id)
    query = query.order_by(SyncedCheckpoint.checkpoint_id.asc())

    result = await db.execute(query)
    checkpoints = result.scalars().all()

    # Pull corresponding writes
    cp_ids = [cp.checkpoint_id for cp in checkpoints]
    writes = []
    if cp_ids:
        writes_query = select(SyncedWrite).where(
            SyncedWrite.user_id == user_id,
            SyncedWrite.thread_id == req.thread_id,
            SyncedWrite.checkpoint_id.in_(cp_ids),
        )
        writes_result = await db.execute(writes_query)
        writes = writes_result.scalars().all()

    return {
        "checkpoints": [
            {
                "checkpoint_id": cp.checkpoint_id,
                "parent_checkpoint_id": cp.parent_checkpoint_id,
                "checkpoint_ns": cp.checkpoint_ns,
                "type": cp.type,
                "checkpoint": base64.b64encode(cp.checkpoint or b"").decode("ascii"),
                "metadata": base64.b64encode(cp.metadata_ or b"").decode("ascii"),
            }
            for cp in checkpoints
        ],
        "writes": [
            {
                "checkpoint_id": w.checkpoint_id,
                "checkpoint_ns": w.checkpoint_ns,
                "task_id": w.task_id,
                "idx": w.idx,
                "channel": w.channel,
                "type": w.type,
                "value": base64.b64encode(w.value or b"").decode("ascii"),
            }
            for w in writes
        ],
    }


@router.post("/threads", response_model=dict)
async def list_synced_threads(req: ThreadListRequest, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """List all synced threads for a user (used for new-device onboarding)."""
    user_id = current_user["sub"]

    query = (
        select(
            SyncedCheckpoint.thread_id,
            func.max(SyncedCheckpoint.synced_at).label("last_synced"),
            func.count(SyncedCheckpoint.checkpoint_id).label("checkpoint_count"),
        )
        .where(SyncedCheckpoint.user_id == user_id)
        .group_by(SyncedCheckpoint.thread_id)
        .order_by(func.max(SyncedCheckpoint.synced_at).desc())
    )
    if req.since:
        query = query.having(func.max(SyncedCheckpoint.synced_at) > req.since)

    result = await db.execute(query)
    threads = [
        ThreadSummary(
            thread_id=row.thread_id,
            last_synced=row.last_synced.isoformat() if row.last_synced else "",
            checkpoint_count=row.checkpoint_count,
        )
        for row in result
    ]
    return {"threads": [t.model_dump() for t in threads]}
