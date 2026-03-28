# Allo Appliance Current Status

## Background

This branch is productizing Allo into a customer-facing Docker appliance with these goals:

- customers install and run locally through Docker
- first-run setup happens in the web UI instead of manual editing of `.env`, `config.yaml`, and `extensions_config.json`
- appliance mode is effectively single-machine / single-tenant
- appliance mode does not require a traditional login page for normal use
- model providers should support:
  - platform default model service
  - OpenAI Official
  - Anthropic Official
  - custom OpenAI-compatible
  - custom Anthropic-compatible
- users should be able to configure multiple providers/models and switch models in the existing chat UI
- public skills should ship by default
- `kkbilling` must not ship in distributable defaults

## What Has Been Implemented

### Appliance runtime and setup foundation

- Docker appliance stack is runnable with:
  - `frontend`
  - `gateway`
  - `langgraph`
  - `postgres`
  - `nginx`
- first-run setup routing works:
  - `/workspace` redirects to `/setup` when `setup_completed=false`
  - `/setup` is reachable on fresh install
- setup state is stored in `appliance_settings`
- runtime config is generated into `/app/data/config.yaml` and `/app/data/.env`

### Safe distributable defaults

- repo default `extensions_config.json` was reduced to:
  - empty `mcpServers`
  - empty `skills` config object
- `kkbilling` is no longer present in distributable default extensions config
- `.dockerignore` now excludes `backend/.deer-flow`
  - this prevents prior chats, checkpoints, and memory files from being copied into customer images
- public skills are still available by default when skills config is empty
- `skills/public/tdli-style-slides` remains included

### Provider/model pool backend groundwork

- setup backend now accepts and preserves provider metadata:
  - `provider`
  - `protocol`
  - `display_name`
  - `base_url`
  - `models`
- setup validation rules were added:
  - provider list cannot be empty
  - each provider must include at least one model
  - `openai_official`, `anthropic_official`, `openai_compatible`, `anthropic_compatible` require API keys
  - custom compatible providers require `base_url`
  - `platform_default` can omit API key
- config renderer now understands these provider types:
  - `platform_default`
  - `openai_official`
  - `anthropic_official`
  - `openai_compatible`
  - `anthropic_compatible`
- renderer supports mixed protocol model pools and can render platform default GPT/Claude through different protocol mappings

### Setup UI groundwork

- setup model step now presents provider options for:
  - Platform Default GPT
  - Platform Default Claude
  - OpenAI Official
  - Anthropic Official
  - Custom OpenAI-Compatible
  - Custom Anthropic-Compatible
- setup search step was added to collect optional:
  - Tavily API key
  - Jina API key
- backend `POST /api/setup/search` exists and persists optional search config

### Auth/API fixes already completed

- appliance mode auth fallback now works for runtime API access in gateway
- `/api/models` now returns `200`
- `/api/skills` now returns `200`
- the Settings -> Skills crash (`["skills"] data is undefined`) was caused by `401` responses and is no longer blocked by that root cause

## Major Problems Encountered

### 1. Docker image/network/bootstrap issues

Encountered during appliance bring-up:

- Docker daemon unavailable initially
- Docker Hub pulls failing because of registry/network issues
- frontend Docker build failing on Google font download (`Geist` via `next/font/google`)
- backend image initially included development runtime state because `backend/.deer-flow` was not excluded
- default config seed initially copied `config.example.yaml`, which was not a valid bootstrap runtime config

### 2. Runtime config / environment issues

Encountered during setup and restart:

- `/app/data/config.yaml` did not exist on first boot until bootstrap seeding was added
- earlier setup runs generated runtime config referencing env vars not present in container runtime
- `platform_default` originally rendered `api_key: $PLATFORM_MODEL_API_KEY` but runtime `.env` stayed empty
- this caused LangGraph to report that no usable chat model was configured

### 3. Appliance auth / API access issues

- `/api/models` and `/api/skills` were initially returning `401`
- root cause was appliance fallback not resolving org data correctly in real SQLAlchemy row objects
- this caused the Skills settings page to fail with `data is undefined`

### 4. Current blocking issue: workspace chat execution is unstable

This is the main unresolved issue.

Current behavior:

- setup completes successfully
- workspace opens successfully
- models API and skills API work
- live LangGraph thread creation works
- live run creation works
- but actual runs do not reliably complete

Observed run states:

- some runs end up `interrupted`
- some runs remain `pending`
- `/runs/wait` can hang for a very long time without completing

Observed queue/log symptoms from `langgraph`:

- queue logs show suspicious state such as:
  - `available=1`
  - `active=0`
  - `n_running=2`
  - `n_pending=2` or `3`
- this suggests local dev queue state is stuck or not being drained correctly
- there was also a warning during cancel behavior:
  - `RuntimeWarning: coroutine 'StreamManager.put' was never awaited`

Current hypothesis:

- the biggest remaining blocker is no longer setup/provider/config logic
- the biggest blocker is the LangGraph `local_dev` runtime / queue / interrupt lifecycle in appliance mode

### 5. Historical conversations still visible in workspace

This is likely a separate issue from the chat execution problem.

Current hypothesis:

- the visible "old history" is likely related to frontend mock/demo thread paths
- frontend contains `mock=true` pathways and demo/case-study navigation
- this is likely not the same as live persisted customer chat data in the fresh appliance

## Tests and Debugging Performed

### Backend automated tests

Repeatedly ran focused regression suites such as:

```bash
PYTHONPATH=. uv run pytest tests/test_setup_router.py tests/test_appliance_packaging_paths.py tests/test_gateway_health.py tests/test_auth.py -v
```

Verified:

- setup route behavior
- provider validation rules
- config renderer output
- appliance auth fallback behavior
- packaging safety rules

### Backend lint

Used focused lint runs such as:

```bash
uv run ruff check app/gateway/routers/setup.py app/gateway/services/config_renderer.py tests/test_setup_router.py tests/test_appliance_packaging_paths.py
```

### Frontend validation

Used:

```bash
pnpm lint && pnpm typecheck
```

And for build validation:

```bash
SKIP_ENV_VALIDATION=1 pnpm build
```

### Docker / runtime verification

Used many direct checks, including:

```bash
docker compose up -d
docker compose ps
docker compose logs gateway --tail=...
docker compose logs langgraph --tail=...
curl http://localhost:3026/health
curl http://localhost:3026/api/setup/status
curl http://localhost:3026/api/models
curl http://localhost:3026/api/skills
```

### Direct runtime inspection inside containers

Used commands like:

```bash
docker exec deer-flow-gateway sh -lc 'cat /app/data/.env'
docker exec deer-flow-gateway sh -lc 'sed -n "1,40p" /app/data/config.yaml'
docker exec deer-flow-postgres psql -U deerflow -d deerflow -c "select key, value from appliance_settings;"
```

### Direct live LangGraph API testing

Verified the runtime independent of the frontend by hitting LangGraph APIs directly:

```bash
POST /api/langgraph/threads
POST /api/langgraph/threads/{thread_id}/runs/stream
POST /api/langgraph/threads/{thread_id}/runs/wait
GET  /api/langgraph/threads/{thread_id}/state
GET  /api/langgraph/threads/{thread_id}/runs/{run_id}
```

Results:

- thread creation works
- run creation works
- execution completion is the unstable part

## Current Known Good State

These parts are now known-good enough to build on:

- appliance startup and setup routing
- setup completion state management
- safe default packaging (`kkbilling` removed, runtime history excluded)
- provider/model pool backend foundation
- setup model/search step code structure
- models API access
- skills API access
- platform default model secret injection into runtime containers

## Current Main Blockers

1. **LangGraph run lifecycle instability in appliance mode**
   - runs get stuck in `pending` or become `interrupted`
   - likely related to `langgraph dev` / local_dev queue behavior

2. **Mock/demo thread leakage into workspace UX**
   - likely separate from live runtime issues

3. **Settings/provider management UI is not finished yet**
   - not the current blocker, but still pending work

## Recommended Next Step

Do not prioritize more setup/provider/settings feature work until the run execution path is stable.

Highest-value next debugging step:

- investigate why `lead_agent` runs created through LangGraph remain `pending` or end `interrupted`
- determine whether appliance should continue using `langgraph dev` at all, or switch to a more stable runtime mode for product delivery
