"""Tests for the auth module: AuthContext model, get_auth_context, get_optional_auth_context."""

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.exc import ProgrammingError

from app.gateway.auth import (
    _DEV_ORG_ID,
    _DEV_ROLE,
    _DEV_USER_ID,
    AuthContext,
    _get_row_value,
    _get_runtime_env,
    _get_runtime_skip_auth,
    _resolve_dev_json_session_fallback,
    _resolve_session_from_db,
    get_auth_context,
    get_optional_auth_context,
)

# ---------------------------------------------------------------------------
# AuthContext model tests
# ---------------------------------------------------------------------------


def test_auth_context_creation() -> None:
    ctx = AuthContext(user_id="u1", org_id="o1", role="admin")
    assert ctx.user_id == "u1"
    assert ctx.org_id == "o1"
    assert ctx.role == "admin"


def test_auth_context_member_role() -> None:
    ctx = AuthContext(user_id="u2", org_id="o2", role="member")
    assert ctx.role == "member"


def test_auth_context_serialization() -> None:
    ctx = AuthContext(user_id="u1", org_id="o1", role="admin")
    data = ctx.model_dump()
    assert data == {"user_id": "u1", "org_id": "o1", "role": "admin"}


def test_auth_context_from_dict() -> None:
    ctx = AuthContext.model_validate({"user_id": "u1", "org_id": "o1", "role": "member"})
    assert ctx.user_id == "u1"


# ---------------------------------------------------------------------------
# _resolve_session_from_db tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_session_valid_token() -> None:
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = ("user-123", "org-456", "admin")
    mock_db.execute.return_value = mock_result

    ctx = await _resolve_session_from_db("valid-token", mock_db)

    assert ctx is not None
    assert ctx.user_id == "user-123"
    assert ctx.org_id == "org-456"
    assert ctx.role == "admin"
    mock_db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_resolve_session_invalid_token() -> None:
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_db.execute.return_value = mock_result

    ctx = await _resolve_session_from_db("bad-token", mock_db)
    assert ctx is None


@pytest.mark.asyncio
async def test_resolve_session_missing_session_table_returns_none_in_dev() -> None:
    mock_db = AsyncMock()
    mock_db.execute.side_effect = ProgrammingError("SELECT ...", {}, Exception('relation "session" does not exist'))

    with patch("app.gateway.auth._env", "development"):
        ctx = await _resolve_session_from_db("missing-table-token", mock_db)

    assert ctx is None
    mock_db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_resolve_dev_session_fallback_missing_session_table_returns_none_in_dev() -> None:
    from app.gateway.auth import _resolve_dev_session_fallback

    mock_db = AsyncMock()
    mock_db.execute.side_effect = ProgrammingError("SELECT ...", {}, Exception('relation "session" does not exist'))

    with patch("app.gateway.auth._env", "development"):
        ctx = await _resolve_dev_session_fallback("missing-table-token", mock_db)

    assert ctx is None
    mock_db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_resolve_dev_json_session_fallback_valid_token(tmp_path) -> None:
    sessions_file = tmp_path / "local-dev-auth-sessions.json"
    sessions_file.write_text(
        json.dumps(
            {
                "sessions": [
                    {
                        "token": "dev-session-token",
                        "userId": "user-json-123",
                        "expiresAt": "2999-01-01T00:00:00+00:00",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    with patch("app.gateway.auth._env", "development"):
        ctx = await _resolve_dev_json_session_fallback(
            "dev-session-token",
            sessions_file,
        )

    assert ctx is not None
    assert ctx.user_id == "user-json-123"
    assert ctx.org_id == _DEV_ORG_ID
    assert ctx.role == _DEV_ROLE


@pytest.mark.asyncio
async def test_resolve_dev_json_session_fallback_rejects_expired_token(tmp_path) -> None:
    sessions_file = tmp_path / "local-dev-auth-sessions.json"
    sessions_file.write_text(
        json.dumps(
            {
                "sessions": [
                    {
                        "token": "expired-json-token",
                        "userId": "user-json-123",
                        "expiresAt": "2000-01-01T00:00:00+00:00",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    with patch("app.gateway.auth._env", "development"):
        ctx = await _resolve_dev_json_session_fallback(
            "expired-json-token",
            sessions_file,
        )

    assert ctx is None


# ---------------------------------------------------------------------------
# get_auth_context tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_auth_context_skip_auth() -> None:
    request = MagicMock()
    mock_db = AsyncMock()

    with patch("app.gateway.auth._get_runtime_skip_auth", return_value=True):
        ctx = await get_auth_context(request, mock_db)

    assert ctx.user_id == _DEV_USER_ID
    assert ctx.org_id == _DEV_ORG_ID
    assert ctx.role == _DEV_ROLE


@pytest.mark.asyncio
async def test_get_auth_context_valid_cookie() -> None:
    request = MagicMock()
    request.cookies = {"better-auth.session_token": "tok-abc"}
    request.headers = {}
    mock_db = AsyncMock()

    with (
        patch("app.gateway.auth._get_runtime_skip_auth", return_value=False),
        patch("app.gateway.auth._resolve_session_from_db", new_callable=AsyncMock) as mock_resolve,
    ):
        mock_resolve.return_value = AuthContext(user_id="u1", org_id="o1", role="member")
        ctx = await get_auth_context(request, mock_db)

    assert ctx.user_id == "u1"
    assert ctx.org_id == "o1"
    mock_resolve.assert_awaited_once_with("tok-abc", mock_db)


@pytest.mark.asyncio
async def test_get_auth_context_expired_cookie_raises_401() -> None:
    from fastapi import HTTPException

    request = MagicMock()
    request.cookies = {"better-auth.session_token": "expired-tok"}
    request.headers = {}
    mock_db = AsyncMock()

    with (
        patch("app.gateway.auth._get_runtime_skip_auth", return_value=False),
        patch("app.gateway.auth._resolve_session_from_db", new_callable=AsyncMock) as mock_resolve,
    ):
        mock_resolve.return_value = None
        with pytest.raises(HTTPException) as exc_info:
            await get_auth_context(request, mock_db)

    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_get_auth_context_no_credentials_raises_401() -> None:
    from fastapi import HTTPException

    request = MagicMock()
    request.cookies = {}
    request.headers = {}
    mock_db = AsyncMock()

    with patch("app.gateway.auth._get_runtime_skip_auth", return_value=False):
        with pytest.raises(HTTPException) as exc_info:
            await get_auth_context(request, mock_db)

    assert exc_info.value.status_code == 401
    assert "required" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_get_auth_context_api_key_not_yet_supported() -> None:
    from fastapi import HTTPException

    request = MagicMock()
    request.cookies = {}
    request.headers = {"X-API-Key": "df-test-key"}
    mock_db = AsyncMock()

    with patch("app.gateway.auth._get_runtime_skip_auth", return_value=False):
        with pytest.raises(HTTPException) as exc_info:
            await get_auth_context(request, mock_db)

    assert exc_info.value.status_code == 401
    assert "not yet supported" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_get_auth_context_bearer_api_key_not_yet_supported() -> None:
    from fastapi import HTTPException

    request = MagicMock()
    request.cookies = {}
    mock_headers = MagicMock()
    mock_headers.get = lambda key, default="": {"Authorization": "Bearer df-my-key", "X-API-Key": ""}.get(key, default)
    request.headers = mock_headers
    mock_db = AsyncMock()

    with patch("app.gateway.auth._get_runtime_skip_auth", return_value=False):
        with pytest.raises(HTTPException) as exc_info:
            await get_auth_context(request, mock_db)

    assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# get_optional_auth_context tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_optional_auth_context_skip_auth() -> None:
    request = MagicMock()
    mock_db = AsyncMock()

    with patch("app.gateway.auth._get_runtime_skip_auth", return_value=True):
        ctx = await get_optional_auth_context(request, mock_db)

    assert ctx is not None
    assert ctx.user_id == _DEV_USER_ID


@pytest.mark.asyncio
async def test_get_optional_auth_context_no_credentials_returns_none() -> None:
    request = MagicMock()
    request.cookies = {}
    mock_db = AsyncMock()

    with patch("app.gateway.auth._get_runtime_skip_auth", return_value=False):
        ctx = await get_optional_auth_context(request, mock_db)

    assert ctx is None


@pytest.mark.asyncio
async def test_get_optional_auth_context_valid_cookie() -> None:
    request = MagicMock()
    request.cookies = {"better-auth.session_token": "tok-xyz"}
    mock_db = AsyncMock()

    with (
        patch("app.gateway.auth._get_runtime_skip_auth", return_value=False),
        patch("app.gateway.auth._resolve_session_from_db", new_callable=AsyncMock) as mock_resolve,
    ):
        mock_resolve.return_value = AuthContext(user_id="u9", org_id="o9", role="admin")
        ctx = await get_optional_auth_context(request, mock_db)

    assert ctx is not None
    assert ctx.user_id == "u9"


@pytest.mark.asyncio
async def test_get_optional_auth_context_invalid_cookie_returns_none() -> None:
    request = MagicMock()
    request.cookies = {"better-auth.session_token": "bad-tok"}
    mock_db = AsyncMock()

    with (
        patch("app.gateway.auth._get_runtime_skip_auth", return_value=False),
        patch("app.gateway.auth._resolve_session_from_db", new_callable=AsyncMock) as mock_resolve,
    ):
        mock_resolve.return_value = None
        ctx = await get_optional_auth_context(request, mock_db)

    assert ctx is None


# ---------------------------------------------------------------------------
# _get_runtime_env and _get_runtime_skip_auth tests
# ---------------------------------------------------------------------------


@patch.dict(os.environ, {"ENV": "development"}, clear=True)
def test_get_runtime_env_from_env() -> None:
    """_get_runtime_env reads from ENV variable."""
    assert _get_runtime_env() == "development"


@patch.dict(os.environ, {"NODE_ENV": "production"}, clear=True)
def test_get_runtime_env_from_node_env() -> None:
    """_get_runtime_env falls back to NODE_ENV."""
    assert _get_runtime_env() == "production"


@patch.dict(os.environ, {}, clear=True)
def test_get_runtime_env_defaults_to_development() -> None:
    """_get_runtime_env defaults to development when not set."""
    assert _get_runtime_env() == "development"


@patch.dict(os.environ, {"ENV": "DEVELOPMENT"}, clear=True)
def test_get_runtime_env_is_lowercased() -> None:
    """_get_runtime_env returns lowercase value."""
    assert _get_runtime_env() == "development"


@patch.dict(os.environ, {"SKIP_AUTH": "1", "ENV": "development"}, clear=True)
def test_get_runtime_skip_auth_true_in_dev() -> None:
    """_get_runtime_skip_auth returns True when SKIP_AUTH=1 in development."""
    assert _get_runtime_skip_auth() is True


@patch.dict(os.environ, {"SKIP_AUTH": "1", "ENV": "production"}, clear=True)
def test_get_runtime_skip_auth_false_in_production() -> None:
    """_get_runtime_skip_auth returns False in production even with SKIP_AUTH=1."""
    assert _get_runtime_skip_auth() is False


@patch.dict(os.environ, {"SKIP_AUTH": "0", "ENV": "development"}, clear=True)
def test_get_runtime_skip_auth_false_when_zero() -> None:
    """_get_runtime_skip_auth returns False when SKIP_AUTH=0."""
    assert _get_runtime_skip_auth() is False


@patch.dict(os.environ, {"ENV": "development"}, clear=True)
def test_get_runtime_skip_auth_false_when_not_set() -> None:
    """_get_runtime_skip_auth returns False when SKIP_AUTH is not set."""
    assert _get_runtime_skip_auth() is False


@patch.dict(os.environ, {"SKIP_AUTH": "1", "ENV": "test"}, clear=True)
def test_get_runtime_skip_auth_true_in_test() -> None:
    """_get_runtime_skip_auth returns True in test environment."""
    assert _get_runtime_skip_auth() is True


@patch.dict(os.environ, {"SKIP_AUTH": "1", "ENV": "dev"}, clear=True)
def test_get_runtime_skip_auth_true_in_dev_short() -> None:
    """_get_runtime_skip_auth returns True in dev environment."""
    assert _get_runtime_skip_auth() is True


# ---------------------------------------------------------------------------
# ALLO_MODE tests
# ---------------------------------------------------------------------------


@patch.dict(os.environ, {"ALLO_MODE": "appliance", "SKIP_AUTH": "1", "ENV": "development"}, clear=True)
def test_skip_auth_disabled_in_appliance_mode() -> None:
    """_get_runtime_skip_auth returns False in appliance mode even with SKIP_AUTH=1."""
    with patch("app.gateway.auth.ALLO_MODE", "appliance"):
        assert _get_runtime_skip_auth() is False


@pytest.mark.asyncio
async def test_get_auth_context_appliance_skips_dev_fallbacks() -> None:
    """In appliance mode, dev fallbacks are not called when DB lookup misses."""
    from fastapi import HTTPException

    request = MagicMock()
    request.cookies = {"better-auth.session_token": "tok-appliance"}
    request.headers = {}
    mock_db = AsyncMock()

    with (
        patch("app.gateway.auth.ALLO_MODE", "appliance"),
        patch("app.gateway.auth._get_runtime_skip_auth", return_value=False),
        patch("app.gateway.auth._resolve_session_from_db", new_callable=AsyncMock) as mock_db_resolve,
        patch("app.gateway.auth._resolve_dev_session_fallback", new_callable=AsyncMock) as mock_dev_fallback,
        patch("app.gateway.auth._resolve_dev_json_session_fallback", new_callable=AsyncMock) as mock_json_fallback,
    ):
        mock_db_resolve.return_value = None
        with pytest.raises(HTTPException) as exc_info:
            await get_auth_context(request, mock_db)

    assert exc_info.value.status_code == 401
    mock_dev_fallback.assert_not_awaited()
    mock_json_fallback.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_auth_context_appliance_accepts_valid_db_session() -> None:
    """In appliance mode, a valid DB session is accepted normally."""
    request = MagicMock()
    request.cookies = {"better-auth.session_token": "tok-valid-appliance"}
    request.headers = {}
    mock_db = AsyncMock()

    with (
        patch("app.gateway.auth.ALLO_MODE", "appliance"),
        patch("app.gateway.auth._get_runtime_skip_auth", return_value=False),
        patch("app.gateway.auth._resolve_session_from_db", new_callable=AsyncMock) as mock_db_resolve,
    ):
        mock_db_resolve.return_value = AuthContext(user_id="u-app", org_id="o-app", role="member")
        ctx = await get_auth_context(request, mock_db)

    assert ctx.user_id == "u-app"
    assert ctx.org_id == "o-app"


@pytest.mark.asyncio
async def test_get_optional_auth_context_appliance_skips_dev_fallbacks() -> None:
    """In appliance mode, get_optional_auth_context skips dev fallbacks and returns None."""
    request = MagicMock()
    request.cookies = {"better-auth.session_token": "tok-opt-appliance"}
    mock_db = AsyncMock()

    with (
        patch("app.gateway.auth.ALLO_MODE", "appliance"),
        patch("app.gateway.auth._get_runtime_skip_auth", return_value=False),
        patch("app.gateway.auth._resolve_session_from_db", new_callable=AsyncMock) as mock_db_resolve,
        patch("app.gateway.auth._resolve_dev_session_fallback", new_callable=AsyncMock) as mock_dev_fallback,
        patch("app.gateway.auth._resolve_dev_json_session_fallback", new_callable=AsyncMock) as mock_json_fallback,
    ):
        mock_db_resolve.return_value = None
        ctx = await get_optional_auth_context(request, mock_db)

    assert ctx is None
    mock_dev_fallback.assert_not_awaited()
    mock_json_fallback.assert_not_awaited()


def test_get_row_value_supports_sqlalchemy_row_like_objects() -> None:
    class FakeRow:
        def __getitem__(self, index: int) -> object:
            values = ["org-123", "default"]
            return values[index]

    assert _get_row_value(FakeRow(), 0) == "org-123"


@pytest.mark.asyncio
async def test_get_auth_context_development_uses_dev_fallbacks() -> None:
    """In development mode (default), dev fallbacks are called when DB lookup misses."""
    request = MagicMock()
    request.cookies = {"better-auth.session_token": "tok-dev-fallback"}
    request.headers = {}
    mock_db = AsyncMock()

    with (
        patch("app.gateway.auth.ALLO_MODE", "development"),
        patch("app.gateway.auth._get_runtime_skip_auth", return_value=False),
        patch("app.gateway.auth._resolve_session_from_db", new_callable=AsyncMock) as mock_db_resolve,
        patch("app.gateway.auth._resolve_dev_session_fallback", new_callable=AsyncMock) as mock_dev_fallback,
        patch("app.gateway.auth._resolve_dev_json_session_fallback", new_callable=AsyncMock) as mock_json_fallback,
    ):
        mock_db_resolve.return_value = None
        mock_dev_fallback.return_value = None
        mock_json_fallback.return_value = AuthContext(user_id="u-json", org_id="dev-org-000", role="admin")
        ctx = await get_auth_context(request, mock_db)

    assert ctx.user_id == "u-json"
    mock_dev_fallback.assert_awaited_once()
    mock_json_fallback.assert_awaited_once()
