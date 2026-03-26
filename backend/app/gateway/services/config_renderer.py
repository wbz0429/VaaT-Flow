"""Config renderer service.

Reads model provider settings from ApplianceSettings and generates
runtime config files (config.yaml, .env, extensions_config.json) that
the existing deerflow config loaders can consume.
"""

import json
import logging
import os
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.gateway.db.models import ApplianceSettings

logger = logging.getLogger(__name__)

DATA_DIR = Path(os.getenv("DEER_FLOW_DATA_DIR", "/app/data"))

# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

PROVIDER_REGISTRY: dict[str, dict] = {
    "openai": {
        "use": "langchain_openai:ChatOpenAI",
        "env_key": "OPENAI_API_KEY",
        "api_key_field": "api_key",
    },
    "anthropic": {
        "use": "langchain_anthropic:ChatAnthropic",
        "env_key": "ANTHROPIC_API_KEY",
        "api_key_field": "api_key",
    },
    "google": {
        "use": "langchain_google_genai:ChatGoogleGenerativeAI",
        "env_key": "GOOGLE_API_KEY",
        "api_key_field": "google_api_key",
    },
    "deepseek": {
        "use": "langchain_openai:ChatOpenAI",
        "env_key": "DEEPSEEK_API_KEY",
        "api_key_field": "api_key",
        "extra": {"base_url": "https://api.deepseek.com"},
    },
}

SANDBOX_PROVIDERS: dict[str, str] = {
    "local": "deerflow.sandbox.local:LocalSandboxProvider",
    "aio": "deerflow.community.aio_sandbox:AioSandboxProvider",
}

# Default tool groups shipped with every generated config
DEFAULT_TOOL_GROUPS = [
    {"name": "web"},
    {"name": "file:read"},
    {"name": "file:write"},
    {"name": "bash"},
]

# Default tools shipped with every generated config
DEFAULT_TOOLS = [
    {"name": "web_search", "group": "web", "use": "deerflow.community.tavily.tools:web_search_tool", "max_results": 5},
    {"name": "web_fetch", "group": "web", "use": "deerflow.community.jina_ai.tools:web_fetch_tool", "timeout": 10},
    {"name": "image_search", "group": "web", "use": "deerflow.community.image_search.tools:image_search_tool", "max_results": 5},
    {"name": "ls", "group": "file:read", "use": "deerflow.sandbox.tools:ls_tool"},
    {"name": "read_file", "group": "file:read", "use": "deerflow.sandbox.tools:read_file_tool"},
    {"name": "write_file", "group": "file:write", "use": "deerflow.sandbox.tools:write_file_tool"},
    {"name": "str_replace", "group": "file:write", "use": "deerflow.sandbox.tools:str_replace_tool"},
    {"name": "bash", "group": "bash", "use": "deerflow.sandbox.tools:bash_tool"},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    """Fetch a single ApplianceSettings value by key.

    Args:
        db: Async database session.
        key: The setting key to look up.

    Returns:
        The setting value string, or None if not found.
    """
    result = await db.execute(select(ApplianceSettings.value).where(ApplianceSettings.key == key))
    row = result.scalar_one_or_none()
    return row


def _build_model_entries(providers_data: list[dict]) -> list[dict]:
    """Convert provider configs into config.yaml model entries.

    Args:
        providers_data: List of provider dicts, each containing
            ``provider``, ``api_key``, and ``models`` keys.

    Returns:
        List of model entry dicts ready for YAML serialisation.
    """
    entries: list[dict] = []
    for provider_cfg in providers_data:
        provider_name = provider_cfg.get("provider", "")
        registry = PROVIDER_REGISTRY.get(provider_name)
        if registry is None:
            logger.warning("Unknown provider %r — skipping", provider_name)
            continue

        models = provider_cfg.get("models", [])
        for m in models:
            entry: dict = {
                "name": m.get("name", m.get("model", "")),
                "display_name": m.get("display_name", m.get("name", m.get("model", ""))),
                "description": m.get("description", ""),
                "use": registry["use"],
                "model": m.get("model", m.get("name", "")),
                registry["api_key_field"]: f"${registry['env_key']}",
            }
            # Merge provider-level extra fields (e.g. base_url for deepseek)
            if "extra" in registry:
                entry.update(registry["extra"])
            # Forward optional per-model overrides
            for optional_key in ("max_tokens", "temperature", "supports_thinking", "supports_vision", "supports_reasoning_effort", "when_thinking_enabled", "base_url"):
                if optional_key in m:
                    entry[optional_key] = m[optional_key]
            entries.append(entry)
    return entries


def _build_env_lines(providers_data: list[dict]) -> list[str]:
    """Build .env file lines from provider configs.

    Args:
        providers_data: List of provider dicts.

    Returns:
        List of ``KEY=value`` strings.
    """
    lines: list[str] = []
    seen_keys: set[str] = set()
    for provider_cfg in providers_data:
        provider_name = provider_cfg.get("provider", "")
        registry = PROVIDER_REGISTRY.get(provider_name)
        if registry is None:
            continue
        env_key = registry["env_key"]
        api_key = provider_cfg.get("api_key", "")
        if env_key not in seen_keys and api_key:
            lines.append(f"{env_key}={api_key}")
            seen_keys.add(env_key)
    return lines


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def render_appliance_config(db: AsyncSession) -> None:
    """Read appliance settings from DB and generate runtime config files.

    Generates:
        - ``<DATA_DIR>/config.yaml``  — main app config consumed by deerflow
        - ``<DATA_DIR>/.env``         — environment variables (API keys)
        - ``<DATA_DIR>/extensions_config.json`` — MCP / skills config (created only if absent)
        - ``<DATA_DIR>/.deer-flow/``  — state directory

    Args:
        db: Async database session.
    """
    # 1. Read settings from DB
    raw_providers = await _get_setting(db, "model_providers")
    default_model = await _get_setting(db, "default_model")
    sandbox_mode = await _get_setting(db, "sandbox_mode") or "local"

    # Parse providers JSON
    providers_data: list[dict] = []
    if raw_providers:
        try:
            providers_data = json.loads(raw_providers)
            if not isinstance(providers_data, list):
                logger.error("model_providers is not a JSON array — got %s", type(providers_data).__name__)
                providers_data = []
        except json.JSONDecodeError:
            logger.error("Failed to parse model_providers JSON")

    # 2. Build model entries
    model_entries = _build_model_entries(providers_data)

    # 3. Resolve sandbox provider
    sandbox_use = SANDBOX_PROVIDERS.get(sandbox_mode, SANDBOX_PROVIDERS["local"])

    # 4. Assemble config dict
    config: dict = {
        "config_version": 2,
        "models": model_entries,
        "tool_groups": DEFAULT_TOOL_GROUPS,
        "tools": DEFAULT_TOOLS,
        "sandbox": {"use": sandbox_use},
        "skills": {"container_path": "/mnt/skills"},
        "title": {"enabled": True, "max_words": 6, "max_chars": 60, "model_name": None},
        "summarization": {
            "enabled": True,
            "model_name": None,
            "trigger": [{"type": "tokens", "value": 15564}],
            "keep": {"type": "messages", "value": 10},
            "trim_tokens_to_summarize": 15564,
            "summary_prompt": None,
        },
        "memory": {
            "enabled": True,
            "storage_path": "memory.json",
            "debounce_seconds": 30,
            "model_name": None,
            "max_facts": 100,
            "fact_confidence_threshold": 0.7,
            "injection_enabled": True,
            "max_injection_tokens": 2000,
        },
        "checkpointer": {"type": "sqlite", "connection_string": "checkpoints.db"},
    }

    # If a default model is set and exists in the entries, move it to the front
    if default_model and model_entries:
        config["models"] = sorted(model_entries, key=lambda m: m.get("name") != default_model)

    # 5. Ensure data directory tree exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    deer_flow_dir = DATA_DIR / ".deer-flow"
    deer_flow_dir.mkdir(parents=True, exist_ok=True)

    # 6. Write config.yaml
    config_path = DATA_DIR / "config.yaml"
    config_path.write_text(yaml.dump(config, default_flow_style=False, sort_keys=False, allow_unicode=True), encoding="utf-8")
    logger.info("Wrote %s (%d models)", config_path, len(model_entries))

    # 7. Write .env
    env_path = DATA_DIR / ".env"
    env_lines = _build_env_lines(providers_data)
    env_path.write_text("\n".join(env_lines) + ("\n" if env_lines else ""), encoding="utf-8")
    logger.info("Wrote %s (%d keys)", env_path, len(env_lines))

    # 8. Write extensions_config.json only if it doesn't exist yet
    extensions_path = DATA_DIR / "extensions_config.json"
    if not extensions_path.exists():
        extensions_path.write_text(json.dumps({"mcpServers": {}, "skills": {}}, indent=2) + "\n", encoding="utf-8")
        logger.info("Created %s", extensions_path)

    # 9. Invalidate cached app config so the next access reloads from disk
    try:
        import deerflow.config.app_config as app_config_module

        app_config_module._app_config = None
        logger.info("Reset deerflow app config cache")
    except Exception:
        pass
