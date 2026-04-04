"""Middleware that captures LLM token usage from model responses."""

import logging
from typing import override

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import AIMessage

from deerflow.agents.thread_state import ThreadState
from deerflow.store_registry import get_store
from deerflow.stores import UsageRecordStore

logger = logging.getLogger(__name__)


class TokenUsageMiddleware(AgentMiddleware[ThreadState]):
    """Captures LLM token usage from model responses and records via UsageRecordStore."""

    state_schema = ThreadState

    @override
    async def awrap_model_call(self, request, handler):
        response = await handler(request)

        # Extract the AI message from the response
        result = response.result if hasattr(response, "result") else None
        if not result:
            return response

        ai_msg = result[0] if isinstance(result, list) and result else result
        if not isinstance(ai_msg, AIMessage):
            return response

        # Extract token usage metadata
        usage = getattr(ai_msg, "usage_metadata", None)
        if not usage:
            return response

        input_tokens = usage.get("input_tokens", 0) if isinstance(usage, dict) else 0
        output_tokens = usage.get("output_tokens", 0) if isinstance(usage, dict) else 0

        if input_tokens == 0 and output_tokens == 0:
            return response

        # Extract context from runtime config
        usage_store = get_store("usage")
        if not isinstance(usage_store, UsageRecordStore):
            return response

        runtime = request.runtime if hasattr(request, "runtime") else None
        config = runtime.config if runtime and hasattr(runtime, "config") else {}
        configurable = config.get("configurable", {}) if isinstance(config, dict) else {}
        user_id = configurable.get("user_id") or configurable.get("x-user-id") or ""
        org_id = configurable.get("org_id") or configurable.get("x-org-id") or ""

        if not user_id or not org_id:
            context = configurable.get("context", {})
            if isinstance(context, dict):
                user_id = user_id or context.get("user_id", "")
                org_id = org_id or context.get("org_id", "")

        model_name = getattr(request.model, "model_name", None) or getattr(request.model, "model", None)

        try:
            await usage_store.record_usage(
                org_id=org_id,
                user_id=user_id,
                record_type="llm_token",
                model_name=str(model_name) if model_name else None,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except Exception as e:
            logger.warning("Failed to record token usage: %s", e)

        return response
