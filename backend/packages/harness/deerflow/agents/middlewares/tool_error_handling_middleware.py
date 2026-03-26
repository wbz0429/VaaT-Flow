"""Tool error handling middleware and shared runtime middleware builders."""

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any
from typing import override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import ToolMessage
from langgraph.errors import GraphBubbleUp
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

logger = logging.getLogger(__name__)

_MISSING_TOOL_CALL_ID = "missing_tool_call_id"


def _runtime_thread_id(runtime: Any, state: Any) -> str:
    runtime_context = getattr(runtime, "context", None)
    if isinstance(runtime_context, dict):
        thread_id = runtime_context.get("thread_id")
        if thread_id:
            return str(thread_id)

    if isinstance(state, dict):
        thread_data = state.get("thread_data") or {}
        if isinstance(thread_data, dict):
            workspace_path = thread_data.get("workspace_path")
            if isinstance(workspace_path, str) and workspace_path:
                return workspace_path.rsplit("/", 1)[-1]

    return "unknown"


def _message_count(state: Any) -> int:
    if isinstance(state, dict):
        messages = state.get("messages")
        if isinstance(messages, list):
            return len(messages)
    return 0


class ExecutionLoggingMiddleware(AgentMiddleware[AgentState]):
    """Emit timing logs for model turns and tool execution."""

    @override
    def before_model(self, state: AgentState, runtime: Any) -> dict | None:
        thread_id = _runtime_thread_id(runtime, state)
        logger.info(
            "[exec] model_start thread_id=%s messages=%d",
            thread_id,
            _message_count(state),
        )
        return None

    @override
    async def abefore_model(self, state: AgentState, runtime: Any) -> dict | None:
        return self.before_model(state, runtime)

    @override
    def after_model(self, state: AgentState, runtime: Any) -> dict | None:
        thread_id = _runtime_thread_id(runtime, state)
        last_message = state.get("messages", [])[-1] if isinstance(state, dict) and state.get("messages") else None
        tool_call_count = len(getattr(last_message, "tool_calls", []) or []) if last_message is not None else 0
        logger.info(
            "[exec] model_end thread_id=%s messages=%d tool_calls=%d",
            thread_id,
            _message_count(state),
            tool_call_count,
        )
        return None

    @override
    async def aafter_model(self, state: AgentState, runtime: Any) -> dict | None:
        return self.after_model(state, runtime)

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        tool_name = str(request.tool_call.get("name") or "unknown_tool")
        tool_call_id = str(request.tool_call.get("id") or _MISSING_TOOL_CALL_ID)
        thread_id = _runtime_thread_id(request.runtime, request.state)
        started_at = time.perf_counter()
        logger.info(
            "[exec] tool_start thread_id=%s name=%s id=%s",
            thread_id,
            tool_name,
            tool_call_id,
        )
        try:
            result = handler(request)
            elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
            logger.info(
                "[exec] tool_end thread_id=%s name=%s id=%s elapsed_ms=%s",
                thread_id,
                tool_name,
                tool_call_id,
                elapsed_ms,
            )
            return result
        except Exception:
            elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
            logger.exception(
                "[exec] tool_error thread_id=%s name=%s id=%s elapsed_ms=%s",
                thread_id,
                tool_name,
                tool_call_id,
                elapsed_ms,
            )
            raise

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command]],
    ) -> ToolMessage | Command:
        tool_name = str(request.tool_call.get("name") or "unknown_tool")
        tool_call_id = str(request.tool_call.get("id") or _MISSING_TOOL_CALL_ID)
        thread_id = _runtime_thread_id(request.runtime, request.state)
        started_at = time.perf_counter()
        logger.info(
            "[exec] tool_start thread_id=%s name=%s id=%s",
            thread_id,
            tool_name,
            tool_call_id,
        )
        try:
            result = await handler(request)
            elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
            logger.info(
                "[exec] tool_end thread_id=%s name=%s id=%s elapsed_ms=%s",
                thread_id,
                tool_name,
                tool_call_id,
                elapsed_ms,
            )
            return result
        except Exception:
            elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
            logger.exception(
                "[exec] tool_error thread_id=%s name=%s id=%s elapsed_ms=%s",
                thread_id,
                tool_name,
                tool_call_id,
                elapsed_ms,
            )
            raise


class ToolErrorHandlingMiddleware(AgentMiddleware[AgentState]):
    """Convert tool exceptions into error ToolMessages so the run can continue."""

    def _build_error_message(self, request: ToolCallRequest, exc: Exception) -> ToolMessage:
        tool_name = str(request.tool_call.get("name") or "unknown_tool")
        tool_call_id = str(request.tool_call.get("id") or _MISSING_TOOL_CALL_ID)
        detail = str(exc).strip() or exc.__class__.__name__
        if len(detail) > 500:
            detail = detail[:497] + "..."

        content = f"Error: Tool '{tool_name}' failed with {exc.__class__.__name__}: {detail}. Continue with available context, or choose an alternative tool."
        return ToolMessage(
            content=content,
            tool_call_id=tool_call_id,
            name=tool_name,
            status="error",
        )

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        try:
            return handler(request)
        except GraphBubbleUp:
            # Preserve LangGraph control-flow signals (interrupt/pause/resume).
            raise
        except Exception as exc:
            logger.exception("Tool execution failed (sync): name=%s id=%s", request.tool_call.get("name"), request.tool_call.get("id"))
            return self._build_error_message(request, exc)

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command]],
    ) -> ToolMessage | Command:
        try:
            return await handler(request)
        except GraphBubbleUp:
            # Preserve LangGraph control-flow signals (interrupt/pause/resume).
            raise
        except Exception as exc:
            logger.exception("Tool execution failed (async): name=%s id=%s", request.tool_call.get("name"), request.tool_call.get("id"))
            return self._build_error_message(request, exc)


def _build_runtime_middlewares(
    *,
    include_uploads: bool,
    include_dangling_tool_call_patch: bool,
    lazy_init: bool = True,
) -> list[AgentMiddleware]:
    """Build shared base middlewares for agent execution."""
    from deerflow.agents.middlewares.thread_data_middleware import ThreadDataMiddleware
    from deerflow.sandbox.middleware import SandboxMiddleware

    middlewares: list[AgentMiddleware] = [
        ThreadDataMiddleware(lazy_init=lazy_init),
        SandboxMiddleware(lazy_init=lazy_init),
        ExecutionLoggingMiddleware(),
    ]

    if include_uploads:
        from deerflow.agents.middlewares.uploads_middleware import UploadsMiddleware

        middlewares.insert(1, UploadsMiddleware())

    if include_dangling_tool_call_patch:
        from deerflow.agents.middlewares.dangling_tool_call_middleware import DanglingToolCallMiddleware

        middlewares.append(DanglingToolCallMiddleware())

    middlewares.append(ToolErrorHandlingMiddleware())
    return middlewares


def build_lead_runtime_middlewares(*, lazy_init: bool = True) -> list[AgentMiddleware]:
    """Middlewares shared by lead agent runtime before lead-only middlewares."""
    return _build_runtime_middlewares(
        include_uploads=True,
        include_dangling_tool_call_patch=True,
        lazy_init=lazy_init,
    )


def build_subagent_runtime_middlewares(*, lazy_init: bool = True) -> list[AgentMiddleware]:
    """Middlewares shared by subagent runtime before subagent-only middlewares."""
    return _build_runtime_middlewares(
        include_uploads=False,
        include_dangling_tool_call_patch=False,
        lazy_init=lazy_init,
    )
