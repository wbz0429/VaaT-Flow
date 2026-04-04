# Product Improvements Design Spec — 4 Issues

## Context

Allo（元枢）has 4 product-level issues:
1. Knowledge Base RAG pipeline is built but isolated from the agent — no tool bridge
2. Admin dashboard shows all zeros — no token tracking, frontend hardcodes usage to 0
3. i18n coverage incomplete — many pages bypass the i18n system with hardcoded text
4. Thread creation flaky — sometimes fails, requires refresh

## User Decisions

- KB: Agent Tool approach via store_registry pattern, thread-level binding + message-level @mention
- Admin: Middleware-based token tracking (wrap_model_call), fits existing middleware architecture
- i18n: Full coverage across all pages
- Thread bug: Deep root cause investigation and fix
- Testing: Local test → pass → deploy to production → test again

## Implementation Order

1. Issue 4 — Thread creation bug (P0 stability)
2. Issue 2 — Token tracking middleware (proves store pattern)
3. Issue 1 — Knowledge Base → Agent integration (largest feature)
4. Issue 3 — i18n full coverage (low-risk sweep)
