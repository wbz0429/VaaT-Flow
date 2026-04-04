"""Knowledge base search tool — searches organization knowledge bases via RAG."""

import asyncio
import concurrent.futures
import logging

from langchain.tools import tool

from deerflow.store_registry import get_store
from deerflow.stores import KnowledgeBaseSearchStore

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run async coroutine from sync tool context."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


@tool("knowledge_base_search", parse_docstring=True)
def knowledge_base_search_tool(
    query: str,
    kb_ids: list[str] | None = None,
    top_k: int = 5,
) -> str:
    """Search the organization's knowledge bases for relevant information.

    Use this tool when you need to find information from uploaded documents,
    templates, guidelines, or other organizational knowledge. The tool performs
    semantic search across document chunks and returns the most relevant passages.

    Args:
        query: The search query describing what information you need.
        kb_ids: Optional list of specific knowledge base IDs to search. If not provided, searches all knowledge bases bound to the current thread.
        top_k: Number of top results to return (default 5).
    """
    store = get_store("kb_search")
    if not isinstance(store, KnowledgeBaseSearchStore):
        return "Knowledge base search is not available."

    try:
        results = _run_async(store.search(kb_ids=kb_ids or [], query=query, top_k=top_k))
    except Exception as e:
        logger.warning("Knowledge base search failed: %s", e)
        return f"Knowledge base search failed: {e}"

    if not results:
        return "No relevant results found in the knowledge bases."

    parts = []
    for i, r in enumerate(results, 1):
        score = r.get("score", 0)
        content = r.get("content", "")
        doc_name = r.get("filename", "unknown")
        parts.append(f"[{i}] (relevance: {score:.0%}, source: {doc_name})\n{content}")

    return "\n\n---\n\n".join(parts)
