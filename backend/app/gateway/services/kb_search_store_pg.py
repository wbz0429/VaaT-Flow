"""Postgres implementation of KnowledgeBaseSearchStore wrapping existing RAG pipeline."""

import logging

from sqlalchemy import select

from deerflow.stores import KnowledgeBaseSearchStore

logger = logging.getLogger(__name__)


class PostgresKBSearchStore(KnowledgeBaseSearchStore):
    """Searches knowledge bases using the existing RAG pipeline."""

    def __init__(self, session_factory):
        self._session_factory = session_factory

    async def search(self, kb_ids: list[str], query: str, top_k: int = 5) -> list[dict]:
        if not kb_ids:
            return []

        from app.gateway.rag.embedder import embed_text
        from app.gateway.rag.retriever import search_chunks

        query_embedding = await embed_text(query)

        all_results = []
        async with self._session_factory() as session:
            for kb_id in kb_ids:
                try:
                    results = await search_chunks(session, query_embedding, kb_id, top_k=top_k)
                    for r in results:
                        doc_id = r.get("doc_id")
                        if doc_id:
                            from app.gateway.db.models import KnowledgeDocument

                            doc = await session.get(KnowledgeDocument, doc_id)
                            r["filename"] = doc.filename if doc else "unknown"
                        else:
                            r["filename"] = "unknown"
                    all_results.extend(results)
                except Exception as e:
                    logger.warning("Failed to search KB %s: %s", kb_id, e)

        all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
        return all_results[:top_k]

    async def list_knowledge_bases(self, org_id: str) -> list[dict]:
        from app.gateway.db.models import KnowledgeBase

        async with self._session_factory() as session:
            stmt = select(KnowledgeBase).where(KnowledgeBase.org_id == org_id).order_by(KnowledgeBase.created_at.desc())
            result = await session.execute(stmt)
            kbs = result.scalars().all()
            return [{"id": str(kb.id), "name": kb.name, "description": kb.description or ""} for kb in kbs]

    async def get_thread_kb_ids(self, thread_id: str) -> list[str]:
        from app.gateway.db.models import ThreadKnowledgeBase

        async with self._session_factory() as session:
            stmt = select(ThreadKnowledgeBase.kb_id).where(ThreadKnowledgeBase.thread_id == thread_id)
            result = await session.execute(stmt)
            return [str(row[0]) for row in result.all()]
