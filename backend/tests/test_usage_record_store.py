"""Tests for UsageRecordStore abstract interface."""

import pytest
from deerflow.stores import UsageRecordStore


def test_usage_record_store_is_abstract():
    """UsageRecordStore cannot be instantiated directly."""
    with pytest.raises(TypeError):
        UsageRecordStore()


def test_usage_record_store_has_record_usage_method():
    """UsageRecordStore defines the record_usage abstract method."""
    assert hasattr(UsageRecordStore, "record_usage")
