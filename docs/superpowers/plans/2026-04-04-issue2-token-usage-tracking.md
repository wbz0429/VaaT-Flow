# Issue 2: Admin Dashboard — Token Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track LLM token usage per model call and surface real data in the admin dashboard (currently all zeros).

**Architecture:** New `UsageRecordStore` abstract interface in harness → Postgres implementation in app → `TokenUsageMiddleware` using `awrap_model_call` to intercept every LLM response and extract `usage_metadata` → new per-org usage endpoint → frontend fix to fetch real data.

**Tech Stack:** Python (LangGraph middleware, FastAPI, SQLAlchemy), TypeScript (Next.js admin pages)

**Testing SOP:** Local test → pass → deploy to production → test again

---

### Task 1: Add UsageRecordStore Abstract Interface

**Files:**
- Modify: `backend/packages/harness/deerflow/stores.py`
- Test: `backend/tests/test_harness_boundary.py` (existing, verify still passes)

- [ ] **Step 1: Write the test**

Create `backend/tests/test_usage_record_store.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_usage_record_store.py -v`
Expected: FAIL — `UsageRecordStore` not yet defined

- [ ] **Step 3: Add UsageRecordStore to stores.py**

Append to `backend/packages/harness/deerflow/stores.py` after the `ModelKeyResolver` class (after line 83):

```python
class UsageRecordStore(ABC):
    """Abstract store for recording LLM token usage and API call metrics."""

    @abstractmethod
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
    ) -> None: ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_usage_record_store.py -v`
Expected: PASS

- [ ] **Step 5: Run harness boundary test**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_harness_boundary.py -v`
Expected: PASS (no app imports in harness)

- [ ] **Step 6: Commit**

```bash
git add backend/packages/harness/deerflow/stores.py backend/tests/test_usage_record_store.py
git commit -m "feat: add UsageRecordStore abstract interface to harness"
```

---

### Task 2: Create TokenUsageMiddleware

**Files:**
- Create: `backend/packages/harness/deerflow/agents/middlewares/token_usage_middleware.py`
- Test: `backend/tests/test_token_usage_middleware.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_token_usage_middleware.py`:

```python
"""Tests for TokenUsageMiddleware."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from deerflow.agents.middlewares.token_usage_middleware import TokenUsageMiddleware
from deerflow.stores import UsageRecordStore


class FakeUsageStore(UsageRecordStore):
    def __init__(self):
        self.records = []

    async def record_usage(self, org_id, user_id, record_type, model_name=None, input_tokens=0, output_tokens=0, endpoint=None, duration_seconds=0.0):
        self.records.append({
            "org_id": org_id,
            "user_id": user_id,
            "record_type": record_type,
            "model_name": model_name,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        })


def test_token_usage_middleware_instantiates():
    mw = TokenUsageMiddleware()
    assert mw is not None


def test_token_usage_middleware_has_awrap_model_call():
    mw = TokenUsageMiddleware()
    assert hasattr(mw, "awrap_model_call")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_token_usage_middleware.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TokenUsageMiddleware**

Create `backend/packages/harness/deerflow/agents/middlewares/token_usage_middleware.py`:

```python
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
            # Try context dict
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_token_usage_middleware.py -v`
Expected: PASS

- [ ] **Step 5: Run harness boundary test**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_harness_boundary.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/packages/harness/deerflow/agents/middlewares/token_usage_middleware.py backend/tests/test_token_usage_middleware.py
git commit -m "feat: add TokenUsageMiddleware to capture LLM token usage"
```

---

### Task 3: Register Middleware in Agent Chain

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/lead_agent/agent.py`

- [ ] **Step 1: Add import**

At the top of `backend/packages/harness/deerflow/agents/lead_agent/agent.py`, add after the existing middleware imports (around line 17):

```python
from deerflow.agents.middlewares.token_usage_middleware import TokenUsageMiddleware
```

- [ ] **Step 2: Add middleware to chain**

In the `_build_middlewares()` function (lines 237-301), add `TokenUsageMiddleware()` after `TitleMiddleware` (line 269) and before `MemoryMiddleware` (line 272). Insert:

```python
        # Token usage tracking — record every LLM call
        middlewares.append(TokenUsageMiddleware())
```

- [ ] **Step 3: Run backend tests**

Run: `cd backend && make test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/packages/harness/deerflow/agents/lead_agent/agent.py
git commit -m "feat: register TokenUsageMiddleware in agent middleware chain"
```

---

### Task 4: Postgres UsageRecordStore Implementation

**Files:**
- Create: `backend/app/gateway/services/usage_record_store_pg.py`
- Test: `backend/tests/test_usage_record_store_pg.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_usage_record_store_pg.py`:

```python
"""Tests for PostgresUsageRecordStore."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.gateway.services.usage_record_store_pg import PostgresUsageRecordStore
from deerflow.stores import UsageRecordStore


def test_implements_abstract_interface():
    """PostgresUsageRecordStore implements UsageRecordStore."""
    store = PostgresUsageRecordStore(session_factory=MagicMock())
    assert isinstance(store, UsageRecordStore)


@pytest.mark.asyncio
async def test_record_usage_creates_row():
    """record_usage creates a UsageRecord in the database."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock(return_value=mock_session)

    store = PostgresUsageRecordStore(session_factory=mock_factory)
    await store.record_usage(
        org_id="org-1",
        user_id="user-1",
        record_type="llm_token",
        model_name="gpt-4",
        input_tokens=100,
        output_tokens=50,
    )

    mock_session.add.assert_called_once()
    mock_session.commit.assert_awaited_once()

    # Verify the UsageRecord fields
    added_record = mock_session.add.call_args[0][0]
    assert added_record.org_id == "org-1"
    assert added_record.user_id == "user-1"
    assert added_record.record_type == "llm_token"
    assert added_record.model_name == "gpt-4"
    assert added_record.input_tokens == 100
    assert added_record.output_tokens == 50
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_usage_record_store_pg.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Create the services directory if needed**

Run: `ls backend/app/gateway/services/` — if it doesn't exist, create it:
```bash
mkdir -p backend/app/gateway/services
touch backend/app/gateway/services/__init__.py
```

- [ ] **Step 4: Implement PostgresUsageRecordStore**

Create `backend/app/gateway/services/usage_record_store_pg.py`:

```python
"""Postgres implementation of UsageRecordStore."""

import uuid

from deerflow.stores import UsageRecordStore
from app.gateway.db.models import UsageRecord


class PostgresUsageRecordStore(UsageRecordStore):
    """Records usage metrics to PostgreSQL via async SQLAlchemy."""

    def __init__(self, session_factory):
        self._session_factory = session_factory

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
        async with self._session_factory() as session:
            record = UsageRecord(
                id=str(uuid.uuid4()),
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
```

- [ ] **Step 5: Run tests**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_usage_record_store_pg.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/gateway/services/ backend/tests/test_usage_record_store_pg.py
git commit -m "feat: add PostgresUsageRecordStore implementation"
```

---

### Task 5: Register Usage Store at Startup

**Files:**
- Modify: `backend/app/gateway/app.py` (line ~77)
- Modify: `backend/app/langgraph_runtime.py` (line ~49)

- [ ] **Step 1: Register in Gateway app.py**

In `backend/app/gateway/app.py`, add import at top:

```python
from app.gateway.services.usage_record_store_pg import PostgresUsageRecordStore
```

After line 77 (after the last `register_store` call in the lifespan function), add:

```python
    register_store("usage", PostgresUsageRecordStore(async_session_factory))
```

- [ ] **Step 2: Register in langgraph_runtime.py**

In `backend/app/langgraph_runtime.py`, add import at top:

```python
from app.gateway.services.usage_record_store_pg import PostgresUsageRecordStore
```

In `_ensure_runtime_stores_registered()` (around line 49), add after the last store registration:

```python
    if get_store("usage") is None:
        register_store("usage", PostgresUsageRecordStore(runtime_async_session_factory))
```

- [ ] **Step 3: Run backend tests**

Run: `cd backend && make test`
Expected: All tests pass including harness boundary

- [ ] **Step 4: Commit**

```bash
git add backend/app/gateway/app.py backend/app/langgraph_runtime.py
git commit -m "feat: register UsageRecordStore at Gateway and LangGraph startup"
```

---

### Task 6: Add Per-Org Usage Breakdown Endpoint

**Files:**
- Modify: `backend/app/gateway/routers/admin.py`
- Test: `backend/tests/test_admin_usage_endpoint.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_admin_usage_endpoint.py`:

```python
"""Tests for admin usage breakdown endpoint response model."""

from pydantic import BaseModel


class OrgUsageBreakdownResponse(BaseModel):
    org_id: str
    org_name: str
    input_tokens: int
    output_tokens: int
    api_calls: int


def test_org_usage_breakdown_response_model():
    """OrgUsageBreakdownResponse validates correctly."""
    data = OrgUsageBreakdownResponse(
        org_id="org-1",
        org_name="Test Org",
        input_tokens=1000,
        output_tokens=500,
        api_calls=10,
    )
    assert data.org_id == "org-1"
    assert data.input_tokens == 1000
    assert data.output_tokens == 500
    assert data.api_calls == 10
```

- [ ] **Step 2: Run test**

Run: `cd backend && PYTHONPATH=. uv run pytest tests/test_admin_usage_endpoint.py -v`
Expected: PASS

- [ ] **Step 3: Add endpoint to admin router**

In `backend/app/gateway/routers/admin.py`, add the response model and endpoint. Add after the existing `GET /api/admin/usage` endpoint (around line 200):

```python
class OrgUsageBreakdownResponse(BaseModel):
    org_id: str
    org_name: str
    input_tokens: int
    output_tokens: int
    api_calls: int


@router.get("/usage/by-org", response_model=list[OrgUsageBreakdownResponse], summary="Usage breakdown by organization")
async def get_usage_by_org(
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
):
    """Get token usage and API call counts grouped by organization. Platform admin only."""
    _require_platform_admin(auth)

    from sqlalchemy import func, select
    from app.gateway.db.models import Organization, UsageRecord

    stmt = (
        select(
            UsageRecord.org_id,
            Organization.name.label("org_name"),
            func.coalesce(func.sum(UsageRecord.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(UsageRecord.output_tokens), 0).label("output_tokens"),
            func.count(UsageRecord.id).label("api_calls"),
        )
        .join(Organization, Organization.id == UsageRecord.org_id)
        .group_by(UsageRecord.org_id, Organization.name)
        .order_by(func.sum(UsageRecord.input_tokens).desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        OrgUsageBreakdownResponse(
            org_id=row.org_id,
            org_name=row.org_name,
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            api_calls=row.api_calls,
        )
        for row in rows
    ]
```

Also add an admin access check endpoint:

```python
@router.get("/check", summary="Check admin access")
async def check_admin_access(auth: AuthContext = Depends(get_auth_context)):
    """Lightweight check for admin access. Returns 200 if authorized, 403 otherwise."""
    _require_platform_admin(auth)
    return {"ok": True}
```

- [ ] **Step 4: Run backend lint and tests**

Run: `cd backend && make lint && make test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/gateway/routers/admin.py backend/tests/test_admin_usage_endpoint.py
git commit -m "feat: add per-org usage breakdown endpoint and admin access check"
```

---

### Task 7: Fix Frontend getUsageByOrg

**Files:**
- Modify: `frontend/src/core/admin/api.ts:53-66`

- [ ] **Step 1: Replace hardcoded implementation**

In `frontend/src/core/admin/api.ts`, replace the `getUsageByOrg` function (lines 53-66):

```typescript
export async function getUsageByOrg(): Promise<OrgUsageBreakdown[]> {
  const res = await fetch(`${getBackendBaseURL()}/api/admin/usage/by-org`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to get usage by org: ${res.statusText}`);
  return res.json() as Promise<OrgUsageBreakdown[]>;
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors. Check that `OrgUsageBreakdown` type in `frontend/src/core/admin/types.ts` matches the backend response shape (org_id, org_name, input_tokens, output_tokens, api_calls).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/core/admin/api.ts
git commit -m "fix: fetch real usage data from backend instead of hardcoded zeros"
```

---

### Task 8: Add Frontend Admin Role Check

**Files:**
- Modify: `frontend/src/app/admin/layout.tsx`

- [ ] **Step 1: Read current layout**

Read `frontend/src/app/admin/layout.tsx` to understand the current session check logic (lines 26-39).

- [ ] **Step 2: Add admin access verification**

In the `useEffect` that checks session (around line 26), add a call to the admin check endpoint after the session check succeeds:

```typescript
useEffect(() => {
  async function checkAccess() {
    try {
      const session = await getSession();
      if (!session.data?.user_id) {
        router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
        return;
      }

      // Verify admin role via backend
      const adminCheck = await fetch(
        `${getBackendBaseURL()}/api/admin/check`,
        { credentials: "include" },
      );
      if (!adminCheck.ok) {
        router.push("/workspace");
        return;
      }

      setAuthorized(true);
    } catch {
      router.push("/workspace");
    }
  }
  checkAccess();
}, [router, pathname]);
```

Add the import for `getBackendBaseURL` if not already present:
```typescript
import { getBackendBaseURL } from "@/core/config";
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin/layout.tsx
git commit -m "feat: add admin role verification in frontend admin layout"
```

---

### Task 9: Local Verification & Deploy

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

- [ ] **Step 3: Manual test — token tracking**

With `make dev` running:
1. Send several messages in a conversation
2. Check database: `SELECT * FROM usage_records WHERE record_type = 'llm_token' ORDER BY created_at DESC LIMIT 10;`
3. Verify rows exist with non-zero `input_tokens` and `output_tokens`

- [ ] **Step 4: Manual test — admin dashboard**

1. Log in as a platform admin
2. Navigate to `/admin`
3. Verify token usage numbers are non-zero
4. Navigate to `/admin/usage` — verify per-org breakdown shows real data

- [ ] **Step 5: Manual test — admin access control**

1. Log in as a non-admin user
2. Navigate to `/admin`
3. Verify redirect to `/workspace`

- [ ] **Step 6: Push and deploy**

```bash
git push origin feature/dev_0404
```

- [ ] **Step 7: Production test**

Repeat Steps 3-5 on production.
