"""Tests for knowledge_base_search tool."""

from deerflow.tools.builtins.knowledge_base_search_tool import knowledge_base_search_tool


def test_tool_has_correct_name():
    assert knowledge_base_search_tool.name == "knowledge_base_search"


def test_tool_has_description():
    assert "knowledge base" in knowledge_base_search_tool.description.lower()
