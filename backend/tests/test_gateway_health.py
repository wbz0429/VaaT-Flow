"""Tests for the gateway health endpoint."""

import importlib
from collections.abc import AsyncGenerator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.gateway.app import create_app
from app.gateway.db.models import ApplianceSettings, Base

_test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
_test_session_factory = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def _setup_db() -> AsyncGenerator[None, None]:
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
def app(monkeypatch) -> FastAPI:
    app_module = importlib.import_module("app.gateway.app")
    monkeypatch.setattr(app_module, "async_engine", _test_engine)
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.mark.asyncio
async def test_health_reports_database_ok_and_setup_status(client: AsyncClient) -> None:
    async with _test_session_factory() as session:
        session.add(ApplianceSettings(key="setup_completed", value="true"))
        await session.commit()

    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "allo-gateway",
        "database": "ok",
        "setup_completed": True,
    }


@pytest.mark.asyncio
async def test_health_degrades_gracefully_when_database_unavailable(client: AsyncClient, monkeypatch) -> None:
    app_module = importlib.import_module("app.gateway.app")

    class _BrokenConnection:
        async def __aenter__(self):
            raise RuntimeError("db unavailable")

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class _BrokenEngine:
        def begin(self):
            return _BrokenConnection()

    monkeypatch.setattr(app_module, "async_engine", _BrokenEngine())

    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "allo-gateway",
        "database": "error",
        "setup_completed": None,
    }
