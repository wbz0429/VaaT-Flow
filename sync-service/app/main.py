"""VaaT-Flow Sync Service — FastAPI application."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine
from app.models import Base
from app.routers import auth, models, sync_checkpoints, sync_memory, sync_settings

logger = logging.getLogger("sync-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured.")

    # Seed first admin if SYNC_ADMIN_EMAIL is set and no admin exists
    admin_email = os.getenv("SYNC_ADMIN_EMAIL")
    admin_password = os.getenv("SYNC_ADMIN_PASSWORD")
    if admin_email and admin_password:
        await _seed_admin(admin_email, admin_password)

    yield

    # Shutdown
    await engine.dispose()


async def _seed_admin(email: str, password: str):
    """Create the first admin user if none exists."""
    import uuid

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.auth import hash_password
    from app.database import async_session_factory
    from app.models import User

    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.role == "admin").limit(1))
        if result.scalar_one_or_none():
            return  # admin already exists

        admin = User(
            id=str(uuid.uuid4()),
            email=email,
            name="Admin",
            password_hash=hash_password(password),
            role="admin",
        )
        db.add(admin)
        await db.commit()
        logger.info(f"Seeded admin user: {email}")


def create_app() -> FastAPI:
    app = FastAPI(
        title="VaaT-Flow Sync Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — allow desktop clients
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Desktop clients don't have a fixed origin
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(auth.router)
    app.include_router(models.router)
    app.include_router(sync_checkpoints.router)
    app.include_router(sync_memory.router)
    app.include_router(sync_settings.router)

    @app.get("/health")
    async def health():
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return {"status": "ok", "db": "connected"}
        except Exception as e:
            return {"status": "degraded", "db": str(e)}

    return app


app = create_app()
