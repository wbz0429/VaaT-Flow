"""Tests for KnowledgeBaseSearchStore abstract interface."""

import pytest

from deerflow.stores import KnowledgeBaseSearchStore


def test_kb_search_store_is_abstract():
    with pytest.raises(TypeError):
        KnowledgeBaseSearchStore()


def test_kb_search_store_has_search_method():
    assert hasattr(KnowledgeBaseSearchStore, "search")


def test_kb_search_store_has_list_method():
    assert hasattr(KnowledgeBaseSearchStore, "list_knowledge_bases")
