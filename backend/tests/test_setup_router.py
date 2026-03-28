"""Tests for the appliance setup router."""

import json
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
import yaml
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.gateway.db.database import get_db_session
from app.gateway.db.models import ApplianceSettings, Base
from app.gateway.routers import setup as setup_router
from app.gateway.services.config_renderer import render_appliance_config

_test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
_test_session_factory = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)


async def _override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with _test_session_factory() as session:
        yield session


def _create_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(setup_router.router)
    app.dependency_overrides[get_db_session] = _override_get_db_session
    return app


@pytest.fixture(autouse=True)
async def _setup_db() -> AsyncGenerator[None, None]:
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                'CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, "emailVerified" BOOLEAN NOT NULL, image TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL)'
            )
        )
        await conn.execute(
            text('CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "providerId" TEXT NOT NULL, "userId" TEXT NOT NULL, password TEXT, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL)')
        )
        await conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS session ("
                "id TEXT PRIMARY KEY, "
                '"userId" TEXT NOT NULL, '
                "token TEXT NOT NULL UNIQUE, "
                '"expiresAt" TIMESTAMP NOT NULL, '
                '"ipAddress" TEXT NOT NULL, '
                '"userAgent" TEXT NOT NULL, '
                '"createdAt" TIMESTAMP NOT NULL, '
                '"updatedAt" TIMESTAMP NOT NULL'
                ")"
            )
        )
    yield
    async with _test_engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS session"))
        await conn.execute(text("DROP TABLE IF EXISTS account"))
        await conn.execute(text('DROP TABLE IF EXISTS "user"'))
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
def app() -> FastAPI:
    return _create_test_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.mark.asyncio
async def test_create_admin_succeeds_with_auth_tables_present(client: AsyncClient) -> None:
    response = await client.post(
        "/api/setup/admin",
        json={"email": "admin@example.com", "password": "supersecret", "name": "Admin"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["session_token"]


@pytest.mark.asyncio
async def test_complete_setup_does_not_mark_complete_when_renderer_fails(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def _boom(_db: AsyncSession) -> None:
        raise RuntimeError("render failed")

    monkeypatch.setattr("app.gateway.services.config_renderer.render_appliance_config", _boom)

    response = await client.post("/api/setup/complete")

    assert response.status_code == 500

    async with _test_session_factory() as session:
        result = await session.execute(select(ApplianceSettings).where(ApplianceSettings.key == "setup_completed"))
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_save_models_accepts_multiple_provider_types_and_preserves_metadata(client: AsyncClient) -> None:
    response = await client.post(
        "/api/setup/models",
        json={
            "providers": [
                {
                    "provider": "platform_default",
                    "protocol": "anthropic",
                    "display_name": "Platform Claude",
                    "api_key": "",
                    "models": [
                        {
                            "name": "claude-sonnet-platform",
                            "display_name": "Claude Sonnet (Platform)",
                            "supports_thinking": True,
                            "supports_reasoning_effort": True,
                        }
                    ],
                },
                {
                    "provider": "anthropic_official",
                    "protocol": "anthropic",
                    "display_name": "Anthropic Official",
                    "api_key": "test-anthropic-key",
                    "models": [
                        {
                            "name": "claude-3-5-haiku-20241022",
                            "display_name": "Claude 3.5 Haiku",
                            "supports_thinking": False,
                        }
                    ],
                },
                {
                    "provider": "openai_compatible",
                    "protocol": "openai",
                    "display_name": "Custom OpenAI Compatible",
                    "api_key": "test-openai-key",
                    "base_url": "https://example.test/v1",
                    "models": [
                        {
                            "name": "custom-gpt",
                            "display_name": "Custom GPT",
                            "supports_thinking": True,
                            "supports_vision": True,
                        },
                        {
                            "name": "custom-fast",
                            "display_name": "Custom Fast",
                            "supports_thinking": False,
                        },
                    ],
                },
            ]
        },
    )

    assert response.status_code == 200
    assert response.json()["model_count"] == 4

    async with _test_session_factory() as session:
        result = await session.execute(select(ApplianceSettings).where(ApplianceSettings.key == "model_providers"))
        stored = result.scalar_one()
        providers = json.loads(stored.value)

    assert [provider["provider"] for provider in providers] == ["platform_default", "anthropic_official", "openai_compatible"]
    assert providers[0]["protocol"] == "anthropic"
    assert providers[2]["base_url"] == "https://example.test/v1"
    assert providers[2]["models"][1]["name"] == "custom-fast"


@pytest.mark.asyncio
async def test_render_appliance_config_builds_full_model_pool_for_mixed_protocols() -> None:
    from app.gateway.services import config_renderer

    tmp_dir = Path("/tmp/test-appliance-config-renderer")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    original_data_dir = config_renderer.DATA_DIR
    config_renderer.DATA_DIR = tmp_dir

    async with _test_session_factory() as session:
        session.add(
            ApplianceSettings(
                key="model_providers",
                value=json.dumps(
                    [
                        {
                            "provider": "platform_default",
                            "protocol": "anthropic",
                            "display_name": "Platform Claude",
                            "api_key": "",
                            "models": [
                                {
                                    "name": "claude-sonnet-platform",
                                    "display_name": "Claude Sonnet (Platform)",
                                    "supports_thinking": True,
                                    "supports_reasoning_effort": True,
                                }
                            ],
                        },
                        {
                            "provider": "openai_official",
                            "protocol": "openai",
                            "display_name": "OpenAI Official",
                            "api_key": "openai-key",
                            "models": [
                                {
                                    "name": "gpt-4o",
                                    "display_name": "GPT-4o",
                                    "supports_thinking": True,
                                    "supports_vision": True,
                                }
                            ],
                        },
                    ]
                ),
            )
        )
        session.add(ApplianceSettings(key="default_model", value="claude-sonnet-platform"))
        await session.commit()

        await render_appliance_config(session)

    config_renderer.DATA_DIR = original_data_dir

    rendered = yaml.safe_load((tmp_dir / "config.yaml").read_text(encoding="utf-8"))
    model_names = [model["name"] for model in rendered["models"]]

    assert model_names == ["claude-sonnet-platform", "gpt-4o"]
    assert rendered["models"][0]["use"] == "langchain_anthropic:ChatAnthropic"
    assert rendered["models"][1]["use"] == "langchain_openai:ChatOpenAI"
    assert rendered["models"][1]["api_key"] == "$OPENAI_API_KEY"


@pytest.mark.asyncio
async def test_render_appliance_config_writes_platform_default_runtime_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.gateway.services import config_renderer

    tmp_dir = Path("/tmp/test-appliance-platform-default-env")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    original_data_dir = config_renderer.DATA_DIR
    config_renderer.DATA_DIR = tmp_dir
    monkeypatch.setenv("PLATFORM_MODEL_API_KEY", "platform-secret-key")

    async with _test_session_factory() as session:
        session.add(
            ApplianceSettings(
                key="model_providers",
                value=json.dumps(
                    [
                        {
                            "provider": "platform_default",
                            "protocol": "openai",
                            "display_name": "Platform Default GPT",
                            "api_key": "",
                            "models": [{"name": "gpt-5.4", "display_name": "GPT-5.4", "supports_thinking": True}],
                        }
                    ]
                ),
            )
        )
        session.add(ApplianceSettings(key="default_model", value="gpt-5.4"))
        await session.commit()

        await render_appliance_config(session)

    env_text = (tmp_dir / ".env").read_text(encoding="utf-8")
    assert "PLATFORM_MODEL_API_KEY=platform-secret-key" in env_text

    config_renderer.DATA_DIR = original_data_dir


@pytest.mark.asyncio
async def test_save_models_rejects_empty_provider_list(client: AsyncClient) -> None:
    response = await client.post("/api/setup/models", json={"providers": []})

    assert response.status_code == 422
    assert "At least one model provider" in response.text


@pytest.mark.asyncio
async def test_save_models_requires_api_key_for_official_and_custom_customer_owned_providers(client: AsyncClient) -> None:
    response = await client.post(
        "/api/setup/models",
        json={
            "providers": [
                {
                    "provider": "anthropic_official",
                    "protocol": "anthropic",
                    "display_name": "Anthropic Official",
                    "api_key": "",
                    "models": [{"name": "claude-sonnet", "display_name": "Claude Sonnet"}],
                }
            ]
        },
    )

    assert response.status_code == 422
    assert "requires an API key" in response.text


@pytest.mark.asyncio
async def test_save_models_requires_base_url_for_custom_compatible_provider(client: AsyncClient) -> None:
    response = await client.post(
        "/api/setup/models",
        json={
            "providers": [
                {
                    "provider": "openai_compatible",
                    "protocol": "openai",
                    "display_name": "Custom OpenAI Compatible",
                    "api_key": "test-openai-key",
                    "base_url": "",
                    "models": [{"name": "custom-gpt", "display_name": "Custom GPT"}],
                }
            ]
        },
    )

    assert response.status_code == 422
    assert "requires a base_url" in response.text


@pytest.mark.asyncio
async def test_save_models_allows_platform_default_without_api_key(client: AsyncClient) -> None:
    response = await client.post(
        "/api/setup/models",
        json={
            "providers": [
                {
                    "provider": "platform_default",
                    "protocol": "openai",
                    "display_name": "Platform Default",
                    "api_key": "",
                    "models": [{"name": "platform-gpt", "display_name": "Platform GPT"}],
                }
            ]
        },
    )

    assert response.status_code == 200
    assert response.json()["model_count"] == 1


@pytest.mark.asyncio
async def test_save_search_providers_persists_optional_keys(client: AsyncClient) -> None:
    response = await client.post(
        "/api/setup/search",
        json={
            "tavily_api_key": "tavily-test-key",
            "jina_api_key": "",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"success": True}

    async with _test_session_factory() as session:
        result = await session.execute(select(ApplianceSettings).where(ApplianceSettings.key == "search_providers"))
        stored = result.scalar_one()
        payload = json.loads(stored.value)

    assert payload == {"tavily_api_key": "tavily-test-key", "jina_api_key": ""}
