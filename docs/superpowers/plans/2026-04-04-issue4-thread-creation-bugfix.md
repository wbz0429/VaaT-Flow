# Issue 4: Thread Creation Bug Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix flaky thread creation where conversations sometimes fail and require page refresh to get responses.

**Architecture:** Four surgical fixes targeting race conditions in the thread creation flow: reorder async operations, add retry for LangGraph sync, guard reconnect behavior, and surface errors.

**Tech Stack:** TypeScript (Next.js frontend), Python (FastAPI backend)

**Testing SOP:** Local test → pass → deploy to production → test again

---

### Task 1: Reorder sendMessage Flow

The core issue: `ensureLangGraphThread` runs AFTER `createThreadRun`, so if LangGraph thread doesn't exist yet, the run record is orphaned.

**Files:**
- Modify: `frontend/src/core/threads/hooks.ts:281-323`

- [ ] **Step 1: Read current sendMessage flow**

Verify the current order at lines 281-323:
```
createThread (line 281)
createThreadRun (line 296)
getSession (line 310-316)
ensureLangGraphThread (line 323)
```

- [ ] **Step 2: Move ensureLangGraphThread before createThreadRun**

In `frontend/src/core/threads/hooks.ts`, move the `ensureLangGraphThread` call to right after `createThread` and before `createThreadRun`. The new flow should be:

```typescript
// Line 281-292: createThread (unchanged)
await createThread({
  thread_id: gatewayThreadId,
  agent_name:
    typeof extraContext?.agent_name === "string"
      ? extraContext.agent_name
      : typeof context.agent_name === "string"
        ? context.agent_name
        : undefined,
  default_model: context.model_name as string | undefined,
  last_model_name: context.model_name as string | undefined,
  status: "active",
});

threadIdRef.current = gatewayThreadId;

// MOVED UP: Ensure LangGraph thread exists before creating run
await ensureLangGraphThread(gatewayThreadId, isMock);

// Now safe to create run record
const run = await createThreadRun(gatewayThreadId, {
  model_name: context.model_name as string | undefined,
  agent_name:
    typeof extraContext?.agent_name === "string"
      ? extraContext.agent_name
      : typeof context.agent_name === "string"
        ? context.agent_name
        : undefined,
  status: "running",
});
```

Remove the old `ensureLangGraphThread` call that was at line 323.

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Manual test — create new thread**

1. Start dev server: `make dev` (from project root)
2. Open http://localhost:2026
3. Create a new conversation, send a message
4. Verify response streams back without needing refresh
5. Repeat 5 times

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/threads/hooks.ts
git commit -m "fix: reorder sendMessage to ensure LangGraph thread before creating run"
```

---

### Task 2: Add Retry to ensureLangGraphThread

Handles transient LangGraph unavailability with a simple 2-attempt retry.

**Files:**
- Modify: `frontend/src/core/api/api-client.ts:11-22`

- [ ] **Step 1: Read current ensureLangGraphThread**

Current implementation at lines 11-22:
```typescript
export async function ensureLangGraphThread(
  threadId: string,
  isMock?: boolean,
): Promise<void> {
  const client = getAPIClient(isMock);
  await client.threads.create({
    threadId,
    ifExists: "do_nothing",
    graphId: DEFAULT_ASSISTANT_ID,
  });
}
```

- [ ] **Step 2: Add retry logic**

Replace the function in `frontend/src/core/api/api-client.ts`:

```typescript
export async function ensureLangGraphThread(
  threadId: string,
  isMock?: boolean,
): Promise<void> {
  const client = getAPIClient(isMock);
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.threads.create({
        threadId,
        ifExists: "do_nothing",
        graphId: DEFAULT_ASSISTANT_ID,
      });
      return;
    } catch (error) {
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        throw error;
      }
    }
  }
}
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/core/api/api-client.ts
git commit -m "fix: add retry to ensureLangGraphThread for transient failures"
```

---

### Task 3: Log Gateway LangGraph Sync Failures

The Gateway silently swallows all errors when syncing thread to LangGraph checkpointer. Replace `pass` with logging.

**Files:**
- Modify: `backend/app/gateway/routers/threads.py:224-228`

- [ ] **Step 1: Read current silent exception handler**

Current code at lines 224-228:
```python
try:
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(f"{LANGGRAPH_URL}/threads", json={"thread_id": request.thread_id})
except Exception:
    pass  # LangGraph will auto-create on first run if this fails
```

- [ ] **Step 2: Replace pass with logging**

In `backend/app/gateway/routers/threads.py`, replace the except block:

```python
try:
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(f"{LANGGRAPH_URL}/threads", json={"thread_id": request.thread_id})
except Exception as e:
    logger.warning("Failed to sync thread %s to LangGraph checkpointer: %s", request.thread_id, e)
```

Verify that `logger` is already imported at the top of the file. If not, add:
```python
import logging
logger = logging.getLogger(__name__)
```

- [ ] **Step 3: Run backend lint**

Run: `cd backend && make lint`
Expected: No lint errors

- [ ] **Step 4: Run backend tests**

Run: `cd backend && make test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/gateway/routers/threads.py
git commit -m "fix: log LangGraph thread sync failures instead of silently swallowing"
```

---

### Task 4: Guard reconnectOnMount for New Threads

The `useStream` hook tries to reconnect and fetch state history on mount, which fails for brand-new threads that don't exist in LangGraph yet.

**Files:**
- Modify: `frontend/src/core/threads/hooks.ts:139-145`

- [ ] **Step 1: Read current useStream configuration**

Current config at lines 139-145:
```typescript
const thread = useStream<ThreadState>({
  apiUrl: getLangGraphBaseURL(isMock),
  assistantId: DEFAULT_ASSISTANT_ID,
  threadId: onStreamThreadId ?? null,
  reconnectOnMount: true,
  fetchStateHistory: { limit: 1 },
  // ...
```

- [ ] **Step 2: Guard reconnectOnMount**

Only reconnect when we have an established thread ID (not for brand-new threads):

```typescript
const thread = useStream<ThreadState>({
  apiUrl: getLangGraphBaseURL(isMock),
  assistantId: DEFAULT_ASSISTANT_ID,
  threadId: onStreamThreadId ?? null,
  reconnectOnMount: !!onStreamThreadId,
  fetchStateHistory: onStreamThreadId ? { limit: 1 } : undefined,
  // ...
```

This ensures:
- Existing threads (navigated to): reconnect and fetch history
- New threads (just created): skip reconnect, wait for first submit

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && pnpm typecheck`
Expected: No type errors

- [ ] **Step 4: Manual test — existing thread reconnection**

1. Open an existing conversation
2. Refresh the page
3. Verify the conversation history loads correctly
4. Verify you can send a new message and get a response

- [ ] **Step 5: Manual test — new thread creation**

1. Create a brand new conversation
2. Send a message immediately
3. Verify response streams back without errors
4. Repeat 5 times to confirm stability

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/threads/hooks.ts
git commit -m "fix: guard reconnectOnMount to prevent errors on new threads"
```

---

### Task 5: Local Verification & Deploy

- [ ] **Step 1: Run full frontend checks**

```bash
cd frontend && pnpm lint && pnpm typecheck
```
Expected: No errors

- [ ] **Step 2: Run full backend checks**

```bash
cd backend && make lint && make test
```
Expected: All pass

- [ ] **Step 3: Full manual test cycle**

With `make dev` running:
1. Create 10 new conversations, send first message in each — all should respond
2. Navigate between existing conversations — history should load
3. Refresh page mid-conversation — should reconnect properly
4. Send message after refresh — should work

- [ ] **Step 4: Push to remote and deploy**

```bash
git push origin feature/dev_0404
```

- [ ] **Step 5: Production test**

Repeat Step 3 on production environment.
