# Subtask Performance Debugging Notes

## Background

We investigated a perceived regression after enabling `Ultra` mode and real subagent execution. Two symptoms were reported:

- Opening large historical conversations became extremely slow or appeared frozen.
- Running multi-subagent tasks felt stalled and sometimes showed poor subtask progress behavior.

During the investigation we also confirmed that `gpt-5.4` had not been marked as `supports_thinking`, which prevented `Ultra` mode and `subagent_enabled` from actually taking effect in some earlier tests. Once that capability flag was enabled locally, the system began exercising the real subagent path.

## Investigation Summary

### 1. `task_tool` async polling change was validated

We changed `backend/packages/harness/deerflow/tools/builtins/task_tool.py` so that task polling uses `await asyncio.sleep(5)` instead of `time.sleep(5)`.

Evidence gathered during testing:

- Three `task` tool calls started concurrently.
- Three subagents (`subagent-exec-_0`, `_1`, `_2`) progressed concurrently.
- Subagents completed actual `read_file`, `web_search`, and `web_fetch` work in parallel.
- The remaining latency shifted to downstream external tools rather than the parent task polling loop.

Conclusion:

- The `task_tool` async change is valid and should be kept.
- It is not the cause of the large-conversation loading regression.

### 2. `SubtaskCard` null-guard was not the performance regression

We separately restored the `frontend/src/components/workspace/messages/subtask-card.tsx` null-guard change.

Observed result:

- Large conversation loading remained responsive.

Conclusion:

- The defensive `task` null handling in `SubtaskCard` is safe.
- It is not the source of the performance regression.

### 3. The real frontend regression came from `frontend/src/core/tasks/context.tsx`

We narrowed the regression through controlled rollback/restoration tests:

- Clearing checkpoint data alone did **not** fix the issue.
- Reverting all local code changes fixed the issue.
- Restoring `task_tool.py` alone did **not** reintroduce the issue.
- Restoring `subtask-card.tsx` alone did **not** reintroduce the issue.
- Restoring `frontend/src/core/tasks/context.tsx` immediately brought the UI freeze back.
- Reverting that file again restored normal behavior.

## Root Cause

The attempted correctness fix in `frontend/src/core/tasks/context.tsx` changed the subtask store update path from a low-frequency, conditionally committed mutation pattern into an always-immutable full-map replacement pattern.

Problematic approach that was tested and then reverted:

- Every subtask update replaced the entire `tasks` map with a new object.
- `SubtaskContext.Provider` therefore received a new `value` on every subtask status/message update.
- All consumers of the context became eligible to re-render on each update.
- Large conversations with many subtask-related UI elements amplified this into severe render thrash.

Why this was especially visible on historical conversations:

- The conversation content itself may be fixed, but entering the page still restores task-related UI state.
- Reconnect/history loading can replay task state transitions and subtask metadata.
- Each replayed update caused a whole-context broadcast.
- Large message trees made those repeated renders expensive enough to look like a freeze.

## What Was Ruled Out

- Checkpoint corruption was **not** the primary cause of this frontend regression.
- `task_tool` async polling was **not** the cause.
- `SubtaskCard` null handling was **not** the cause.

## Related but Separate Findings

These were observed during the same investigation but are not the root cause of the confirmed frontend regression:

- `/threads/{thread_id}/history` handling is still too heavy and appears to initialize agent/tool/MCP state when loading history.
- External `web_search` / `web_fetch` calls are now a bigger bottleneck for real multi-subagent work than the parent task polling loop.
- Shared-loop runtime behavior and old persisted run state can still worsen overall responsiveness.

## Final Decisions

Keep:

- `backend/packages/harness/deerflow/tools/builtins/task_tool.py` async polling fix
- `frontend/src/components/workspace/messages/subtask-card.tsx` defensive null guard

Do not keep:

- The reverted `frontend/src/core/tasks/context.tsx` full immutable-map update approach

## Follow-up Recommendation

If we revisit the original subtask-store correctness issue, do **not** use whole-map replacement through a broad React context update path.

Safer options to consider later:

- Move subtasks to a finer-grained store such as Zustand or `useSyncExternalStore`
- Use selector-based subscriptions per `taskId`
- Preserve narrow commit behavior instead of broadcasting every subtask update through the entire context tree
