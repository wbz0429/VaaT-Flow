"""Postgres-backed implementation of the harness UsageRecordStore."""

from app.gateway.db.models import UsageRecord
from deerflow.stores import UsageRecordStore


class PostgresUsageRecordStore(UsageRecordStore):
    """Persist LLM token usage records in the gateway Postgres usage_records table."""

    def __init__(self, async_session_factory) -> None:
        self._async_session_factory = async_session_factory

    async def record_usage(
        self,
        org_id: str,
        user_id: str,
        record_type: str,
        model_name: str | None = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        endpoint: str | None = None,
        duration_seconds: float = 0.0,
    ) -> None:
        async with self._async_session_factory() as session:
            record = UsageRecord(
                org_id=org_id,
                user_id=user_id,
                record_type=record_type,
                model_name=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                endpoint=endpoint,
                duration_seconds=duration_seconds,
            )
            session.add(record)
            await session.commit()
