# Issue 1: Knowledge Base → Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge the existing RAG pipeline to the LangGraph agent so it can search knowledge bases during conversations, with thread-level KB binding and message-level @mention support.

**Architecture:** `KnowledgeBaseSearchStore` abstract interface in harness → Postgres implementation wrapping existing RAG code → `knowledge_base_search` builtin tool → thread-KB join table + API → frontend thread settings + @mention UI. Follows the same store_registry pattern as memory/soul/skills.

**Tech Stack:** Python (LangGraph tools, FastAPI, SQLAlchemy), TypeScript (Next.js frontend)

**Testing SOP:** Local test → pass → deploy to production → test again

---

### Task 1: Add KnowledgeBaseSearchStore Abstract Interface

**Files:**
- Modify: `backend/packages/harness/deerflow/stores.py`
- Test: `backend/tests/test_kb_search_store.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_kb_search_store.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_kb_search_store.py -v`
Expected: FAIL — `KnowledgeBaseSearchStore` not defined

- [ ] **Step 3: Add interface to stores.py**

Append to `backend/packages/harness/deerflow/stores.py` after `UsageRecordStore` (added in Issue 2):

```python
class KnowledgeBaseSearchStore(ABC):
    """Abstract store for searching knowledge base documents via RAG."""

    @abstractmethod
    async def search(self, kb_ids: list[str], query: str, top_k: int = 5) -> list[dict]: ...

    @abstractmethod
    async def list_knowledge_bases(self, org_id: str) -> list[dict]: ...
```

- [ ] **Step 4: Run tests**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_kb_search_store.py -v`
Expected: PASS

- [ ] **Step 5: Run harness boundary test**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_harness_boundary.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/packages/harness/deerflow/stores.py backend/tests/test_kb_search_store.py
git commit -m "feat: add KnowledgeBaseSearchStore abstract interface to harness"
```

---

### Task 2: Create knowledge_base_search Builtin Tool

**Files:**
- Create: `backend/packages/harness/deerflow/tools/builtins/knowledge_base_search_tool.py`
- Modify: `backend/packages/harness/deerflow/tools/builtins/__init__.py`
- Test: `backend/tests/test_kb_search_tool.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_kb_search_tool.py`:

```python
"""Tests for knowledge_base_search tool."""

import pytest
from unittest.mock import patch, MagicMock

from deerflow.tools.builtins.knowledge_base_search_tool import knowledge_base_search_tool


def test_tool_has_correct_name():
    assert knowledge_base_search_tool.name == "knowledge_base_search"


def test_tool_has_description():
    assert "knowledge base" in knowledge_base_search_tool.description.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_kb_search_tool.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the tool**

Create `backend/packages/harness/deerflow/tools/builtins/knowledge_base_search_tool.py`:

```python
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
```

- [ ] **Step 4: Add export to __init__.py**

In `backend/packages/harness/deerflow/tools/builtins/__init__.py`, add:

```python
from .knowledge_base_search_tool import knowledge_base_search_tool
```

- [ ] **Step 5: Run tests**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_kb_search_tool.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/packages/harness/deerflow/tools/builtins/knowledge_base_search_tool.py \
       backend/packages/harness/deerflow/tools/builtins/__init__.py \
       backend/tests/test_kb_search_tool.py
git commit -m "feat: add knowledge_base_search builtin tool"
```

---

### Task 3: Conditionally Register KB Tool in get_available_tools

**Files:**
- Modify: `backend/packages/harness/deerflow/tools/tools.py`

- [ ] **Step 1: Add conditional KB tool inclusion**

In `backend/packages/harness/deerflow/tools/tools.py`, in the `get_available_tools` function, after the view_image_tool conditional block (around lines 101-105), add:

```python
    # Knowledge base search — only available when KB store is registered
    from deerflow.store_registry import get_store
    from deerflow.stores import KnowledgeBaseSearchStore
    kb_store = get_store("kb_search")
    if isinstance(kb_store, KnowledgeBaseSearchStore):
        from deerflow.tools.builtins import knowledge_base_search_tool
        builtin_tools.append(knowledge_base_search_tool)
```

- [ ] **Step 2: Run backend tests**

Run: `cd backend && make lint && make test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add backend/packages/harness/deerflow/tools/tools.py
git commit -m "feat: conditionally include knowledge_base_search tool when store available"
```

---

### Task 4: Postgres KnowledgeBaseSearchStore Implementation

**Files:**
- Create: `backend/app/gateway/services/kb_search_store_pg.py`
- Test: `backend/tests/test_kb_search_store_pg.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_kb_search_store_pg.py`:

```python
"""Tests for PostgresKBSearchStore."""

from unittest.mock import MagicMock

from app.gateway.services.kb_search_store_pg import PostgresKBSearchStore
from deerflow.stores import KnowledgeBaseSearchStore


def test_implements_abstract_interface():
    store = PostgresKBSearchStore(session_factory=MagicMock())
    assert isinstance(store, KnowledgeBaseSearchStore)


def test_has_search_method():
    store = PostgresKBSearchStore(session_factory=MagicMock())
    assert callable(getattr(store, "search", None))


def test_has_list_knowledge_bases_method():
    store = PostgresKBSearchStore(session_factory=MagicMock())
    assert callable(getattr(store, "list_knowledge_bases", None))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_kb_search_store_pg.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PostgresKBSearchStore**

Create `backend/app/gateway/services/kb_search_store_pg.py`:

```python
"""Postgres implementation of KnowledgeBaseSearchStore wrapping existing RAG pipeline."""

import logging

from sqlalchemy import select

from deerflow.stores import KnowledgeBaseSearchStore

logger = logging.getLogger(__name__)


class PostgresKBSearchStore(KnowledgeBaseSearchStore):
    """Searches knowledge bases using the existing RAG pipeline (embedder + retriever)."""

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
                    # Enrich with document filename
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

        # Sort by score descending and take top_k across all KBs
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
        """Get knowledge base IDs bound to a thread."""
        from app.gateway.db.models import ThreadKnowledgeBase

        async with self._session_factory() as session:
            stmt = select(ThreadKnowledgeBase.kb_id).where(ThreadKnowledgeBase.thread_id == thread_id)
            result = await session.execute(stmt)
            return [str(row[0]) for row in result.all()]
```

- [ ] **Step 4: Run tests**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_kb_search_store_pg.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/gateway/services/kb_search_store_pg.py backend/tests/test_kb_search_store_pg.py
git commit -m "feat: add PostgresKBSearchStore wrapping existing RAG pipeline"
```

---

### Task 5: Add ThreadKnowledgeBase Join Table

**Files:**
- Modify: `backend/app/gateway/db/models.py`

- [ ] **Step 1: Add the model**

In `backend/app/gateway/db/models.py`, after the `Thread` model (around line 327), add:

```python
class ThreadKnowledgeBase(Base):
    """Join table linking threads to knowledge bases."""

    __tablename__ = "thread_knowledge_bases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    thread_id = Column(String(255), ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    kb_id = Column(String(36), ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("thread_id", "kb_id", name="uq_thread_kb"),)
```

Ensure `uuid` is imported at the top of the file. Also ensure `UniqueConstraint` is imported from `sqlalchemy`.

- [ ] **Step 2: Run backend lint**

Run: `cd backend && make lint`
Expected: No errors

- [ ] **Step 3: Run backend tests**

Run: `cd backend && make test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add backend/app/gateway/db/models.py
git commit -m "feat: add ThreadKnowledgeBase join table model"
```

---

### Task 6: Register KB Store at Startup

**Files:**
- Modify: `backend/app/gateway/app.py`
- Modify: `backend/app/langgraph_runtime.py`

- [ ] **Step 1: Register in Gateway app.py**

Add import at top:
```python
from app.gateway.services.kb_search_store_pg import PostgresKBSearchStore
```

After the usage store registration (added in Issue 2), add:
```python
    register_store("kb_search", PostgresKBSearchStore(async_session_factory))
```

- [ ] **Step 2: Register in langgraph_runtime.py**

Add import at top:
```python
from app.gateway.services.kb_search_store_pg import PostgresKBSearchStore
```

In `_ensure_runtime_stores_registered()`, add:
```python
    if get_store("kb_search") is None:
        register_store("kb_search", PostgresKBSearchStore(runtime_async_session_factory))
```

- [ ] **Step 3: Run backend tests**

Run: `cd backend && make test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add backend/app/gateway/app.py backend/app/langgraph_runtime.py
git commit -m "feat: register KBSearchStore at Gateway and LangGraph startup"
```

---

### Task 7: Thread-KB API Endpoints

**Files:**
- Modify: `backend/app/gateway/routers/threads.py`

- [ ] **Step 1: Add request/response models**

At the top of `backend/app/gateway/routers/threads.py`, add:

```python
class ThreadKBBindRequest(BaseModel):
    kb_ids: list[str] = Field(..., description="Knowledge base IDs to bind")

class ThreadKBResponse(BaseModel):
    id: str
    kb_id: str
    kb_name: str
    created_at: str
```

- [ ] **Step 2: Add bind endpoint**

```python
@router.post("/{thread_id}/knowledge-bases", response_model=list[ThreadKBResponse])
async def bind_knowledge_bases(
    thread_id: str,
    request: ThreadKBBindRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
):
    """Bind one or more knowledge bases to a thread."""
    thread = await _get_owned_thread(db, thread_id, auth)

    from app.gateway.db.models import ThreadKnowledgeBase, KnowledgeBase

    results = []
    for kb_id in request.kb_ids:
        # Verify KB exists and belongs to same org
        kb = await db.get(KnowledgeBase, kb_id)
        if not kb or str(kb.org_id) != auth.org_id:
            continue

        # Check if already bound
        existing = await db.execute(
            select(ThreadKnowledgeBase).where(
                ThreadKnowledgeBase.thread_id == thread_id,
                ThreadKnowledgeBase.kb_id == kb_id,
            )
        )
        if existing.scalar_one_or_none():
            continue

        binding = ThreadKnowledgeBase(
            id=str(uuid.uuid4()),
            thread_id=thread_id,
            kb_id=kb_id,
        )
        db.add(binding)
        results.append(ThreadKBResponse(
            id=binding.id,
            kb_id=kb_id,
            kb_name=kb.name,
            created_at=binding.created_at.isoformat() if binding.created_at else "",
        ))

    await db.commit()
    return results
```

- [ ] **Step 3: Add list endpoint**

```python
@router.get("/{thread_id}/knowledge-bases", response_model=list[ThreadKBResponse])
async def list_thread_knowledge_bases(
    thread_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
):
    """List knowledge bases bound to a thread."""
    await _get_owned_thread(db, thread_id, auth)

    from app.gateway.db.models import ThreadKnowledgeBase, KnowledgeBase

    stmt = (
        select(ThreadKnowledgeBase, KnowledgeBase.name)
        .join(KnowledgeBase, KnowledgeBase.id == ThreadKnowledgeBase.kb_id)
        .where(ThreadKnowledgeBase.thread_id == thread_id)
        .order_by(ThreadKnowledgeBase.created_at)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        ThreadKBResponse(
            id=str(row[0].id),
            kb_id=str(row[0].kb_id),
            kb_name=row[1],
            created_at=row[0].created_at.isoformat() if row[0].created_at else "",
        )
        for row in rows
    ]
```

- [ ] **Step 4: Add unbind endpoint**

```python
@router.delete("/{thread_id}/knowledge-bases/{kb_id}")
async def unbind_knowledge_base(
    thread_id: str,
    kb_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
):
    """Unbind a knowledge base from a thread."""
    await _get_owned_thread(db, thread_id, auth)

    from app.gateway.db.models import ThreadKnowledgeBase

    stmt = select(ThreadKnowledgeBase).where(
        ThreadKnowledgeBase.thread_id == thread_id,
        ThreadKnowledgeBase.kb_id == kb_id,
    )
    result = await db.execute(stmt)
    binding = result.scalar_one_or_none()
    if not binding:
        raise HTTPException(status_code=404, detail="Knowledge base not bound to thread")

    await db.delete(binding)
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 5: Run backend lint and tests**

Run: `cd backend && make lint && make test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add backend/app/gateway/routers/threads.py
git commit -m "feat: add thread-KB binding API endpoints"
```

---

### Task 8: Resolve KB IDs in LangGraph Runtime

**Files:**
- Modify: `backend/app/langgraph_runtime.py`

- [ ] **Step 1: Add KB resolution in make_lead_agent**

In `backend/app/langgraph_runtime.py`, in the `make_lead_agent` function, after the existing metadata pre-resolution block (around line 140), add:

```python
    # Resolve thread-bound knowledge bases
    kb_search_store = get_store("kb_search")
    if kb_search_store and hasattr(kb_search_store, "get_thread_kb_ids"):
        configurable = config.get("configurable", {})
        thread_id = configurable.get("thread_id") or configurable.get("threadId")
        if thread_id:
            try:
                thread_kb_ids = _run_coroutine_sync(kb_search_store.get_thread_kb_ids(thread_id))
            except Exception as e:
                logger.warning("Failed to resolve thread KB IDs: %s", e)
                thread_kb_ids = []

            # Merge with any @mention KB IDs from context
            context_kb_ids = configurable.get("kb_ids", [])
            if isinstance(context_kb_ids, str):
                context_kb_ids = [context_kb_ids]
            resolved_kb_ids = list(set(thread_kb_ids + context_kb_ids))

            if resolved_kb_ids:
                metadata["resolved_kb_ids"] = resolved_kb_ids
```

Ensure `_run_coroutine_sync` is available (it's already defined in `agent.py` — if not available here, import or replicate the pattern).

- [ ] **Step 2: Run backend tests**

Run: `cd backend && make test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add backend/app/langgraph_runtime.py
git commit -m "feat: resolve thread-bound KB IDs in LangGraph runtime"
```

---

### Task 9: Frontend — Thread KB Binding API

**Files:**
- Create: `frontend/src/core/threads/kb-api.ts`

- [ ] **Step 1: Create the API module**

Create `frontend/src/core/threads/kb-api.ts`:

```typescript
import { getBackendBaseURL } from "@/core/config";

export interface ThreadKBBinding {
  id: string;
  kb_id: string;
  kb_name: string;
  created_at: string;
}

export async function getThreadKnowledgeBases(
  threadId: string,
): Promise<ThreadKBBinding[]> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/threads/${threadId}/knowledge-bases`,
    { credentials: "include" },
  );
  if (!res.ok) return [];
  return res.json() as Promise<ThreadKBBinding[]>;
}

export async function bindKnowledgeBases(
  threadId: string,
  kbIds: string[],
): Promise<ThreadKBBinding[]> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/threads/${threadId}/knowledge-bases`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kb_ids: kbIds }),
    },
  );
  if (!res.ok) throw new Error("Failed to bind knowledge bases");
  return res.json() as Promise<ThreadKBBinding[]>;
}

export async function unbindKnowledgeBase(
  threadId: string,
  kbId: string,
): Promise<void> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/threads/${threadId}/knowledge-bases/${kbId}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) throw new Error("Failed to unbind knowledge base");
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/core/threads/kb-api.ts
git commit -m "feat: add thread-KB binding API client"
```

---

### Task 10: Frontend — Thread KB Settings Panel

This task creates a UI panel in the chat header for binding KBs to the current thread. The exact component structure depends on the existing chat header layout — read the current code first and integrate accordingly.

**Files:**
- Create: `frontend/src/components/workspace/thread-kb-settings.tsx`
- Modify: Chat header component (identify by reading `frontend/src/components/workspace/`)

- [ ] **Step 1: Read existing chat header to find integration point**

Explore `frontend/src/components/workspace/` to find where thread settings/header controls live.

- [ ] **Step 2: Create ThreadKBSettings component**

Create `frontend/src/components/workspace/thread-kb-settings.tsx` — a popover/dialog that:
- Lists currently bound KBs with unbind buttons
- Shows a multi-select of available KBs (from `useKnowledgeBases` hook in `core/knowledge/hooks.ts`)
- Calls `bindKnowledgeBases` / `unbindKnowledgeBase` from `core/threads/kb-api.ts`

- [ ] **Step 3: Integrate into chat header**

Add a button/icon in the chat header that opens the ThreadKBSettings panel.

- [ ] **Step 4: Verify frontend compiles**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workspace/thread-kb-settings.tsx
git commit -m "feat: add thread KB settings panel in chat header"
```

---

### Task 11: Frontend — @Mention KB in Input Box

**Files:**
- Modify: `frontend/src/components/workspace/input-box.tsx`
- Modify: `frontend/src/core/threads/hooks.ts`

- [ ] **Step 1: Add @mention detection in input box**

In `frontend/src/components/workspace/input-box.tsx`, add logic to detect `@` character and show a dropdown of available KBs. When a KB is selected, store its ID in a local state array `selectedKbIds`.

Pass `selectedKbIds` through the `onSubmit` callback so it reaches `sendMessage`.

- [ ] **Step 2: Pass kb_ids through sendMessage**

In `frontend/src/core/threads/hooks.ts`, in the `sendMessage` callback, include `kb_ids` in the context object passed to `thread.submit()` (around line 443):

```typescript
await thread.submit(
  { messages: [inputMessage] },
  {
    config: {
      configurable: {
        // ... existing fields ...
        kb_ids: extraContext?.kb_ids ?? [],
      },
    },
    // ... existing options ...
  },
);
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workspace/input-box.tsx frontend/src/core/threads/hooks.ts
git commit -m "feat: add @mention KB support in input box"
```

---

### Task 12: Local Verification & Deploy

- [ ] **Step 1: Run full backend checks**

```bash
cd backend && make lint && make test
```
Expected: All pass

- [ ] **Step 2: Run full frontend checks**

```bash
cd frontend && pnpm lint && pnpm typecheck
```
Expected: No errors

- [ ] **Step 3: Manual test — KB tool integration**

With `make dev` running:
1. Create a knowledge base, upload a document (e.g., a company policy PDF)
2. Create a new thread
3. Open thread settings, bind the KB to the thread
4. Ask the agent a question about the document content
5. Verify the agent calls `knowledge_base_search` tool and returns relevant content

- [ ] **Step 4: Manual test — @mention**

1. In the input box, type `@` and verify KB dropdown appears
2. Select a KB, type a question, send
3. Verify the agent searches that specific KB

- [ ] **Step 5: Push and deploy**

```bash
git push origin feature/dev_0404
```

- [ ] **Step 6: Production test**

Repeat Steps 3-4 on production.
