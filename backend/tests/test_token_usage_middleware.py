"""Tests for TokenUsageMiddleware."""

from deerflow.agents.middlewares.token_usage_middleware import TokenUsageMiddleware


def test_token_usage_middleware_instantiates():
    mw = TokenUsageMiddleware()
    assert mw is not None


def test_token_usage_middleware_has_awrap_model_call():
    mw = TokenUsageMiddleware()
    assert hasattr(mw, "awrap_model_call")
