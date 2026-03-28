"""Regression tests for appliance packaging path behavior."""

from __future__ import annotations

import json
from pathlib import Path

from app.gateway.routers.mcp import _resolve_extensions_config_write_path
from deerflow.config.extensions_config import ExtensionsConfig


def test_extensions_config_from_file_uses_env_path(monkeypatch, tmp_path: Path) -> None:
    """Reads should respect DEER_FLOW_EXTENSIONS_CONFIG_PATH when it points to a file."""
    config_path = tmp_path / "appliance-data" / "extensions_config.json"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(json.dumps({"mcpServers": {"demo": {"enabled": True, "type": "stdio", "command": "npx"}}, "skills": {}}), encoding="utf-8")

    monkeypatch.setenv("DEER_FLOW_EXTENSIONS_CONFIG_PATH", str(config_path))

    config = ExtensionsConfig.from_file()

    assert set(config.mcp_servers) == {"demo"}
    assert config.mcp_servers["demo"].command == "npx"


def test_resolve_extensions_config_write_path_uses_env_path_even_before_file_exists(monkeypatch, tmp_path: Path) -> None:
    """Writes should target the appliance data path when the env var is configured."""
    config_path = tmp_path / "app-data" / "extensions_config.json"
    monkeypatch.setenv("DEER_FLOW_EXTENSIONS_CONFIG_PATH", str(config_path))

    resolved = _resolve_extensions_config_write_path()

    assert resolved == config_path
    assert resolved.exists() is False


def test_repo_default_extensions_config_has_no_mcp_servers() -> None:
    """Distributable default extensions config should not ship MCP server entries."""
    config_path = Path(__file__).resolve().parents[2] / "extensions_config.json"

    config = ExtensionsConfig.from_file(str(config_path))

    assert config.mcp_servers == {}


def test_public_skills_default_to_enabled_when_unconfigured(monkeypatch, tmp_path: Path) -> None:
    """Public skills should remain enabled by default with an empty skills config."""
    config_path = tmp_path / "extensions_config.json"
    config_path.write_text('{"mcpServers": {}, "skills": {}}', encoding="utf-8")
    monkeypatch.setenv("DEER_FLOW_EXTENSIONS_CONFIG_PATH", str(config_path))

    config = ExtensionsConfig.from_file()

    assert config.is_skill_enabled("deep-research", "public") is True
    assert config.is_skill_enabled("tdli-style-slides", "public") is True


def test_dockerignore_excludes_runtime_history_from_build_context() -> None:
    """Distributable image builds must exclude development runtime history files."""
    dockerignore_path = Path(__file__).resolve().parents[2] / ".dockerignore"
    dockerignore = dockerignore_path.read_text(encoding="utf-8")

    assert "backend/.deer-flow" in dockerignore
    assert "backend/.deer-flow/" in dockerignore or "backend/.deer-flow" in dockerignore
