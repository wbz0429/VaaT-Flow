# Hybrid Desktop Client Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 DeerFlow 从纯 Web 应用改造为 Tauri 桌面客户端 + 云端数据同步服务，实现本地计算、云端存储、跨设备接力。

**Architecture:**
本地 Tauri 应用内嵌 Next.js 前端 + Python 后端（sidecar），所有 LLM 调用和 agent 编排在用户本机执行。
云端只运行一个轻量 Sync Service（FastAPI + PostgreSQL + S3），负责存储 thread checkpoints、memory、用户设置和 artifacts。
客户端内置 Sync Engine，后台增量同步数据到云端，支持离线使用、上线后自动补同步。

**Tech Stack:** Tauri 2.x (Rust + WebView), Next.js 16, Python 3.12 (sidecar), FastAPI (sync service), PostgreSQL, S3-compatible storage

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    User's Machine                        │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                 Tauri Shell                         │  │
│  │  ┌──────────────┐  ┌───────────────────────────┐   │  │
│  │  │   WebView     │  │   Sync Engine (Rust)      │   │  │
│  │  │   Next.js     │  │   - checkpoint push/pull  │   │  │
│  │  │   (bundled)   │  │   - memory sync           │   │  │
│  │  │              ◄├──┤   - artifact upload        │   │  │
│  │  └──────┬───────┘  │   - offline queue          │   │  │
│  │         │           └───────────┬───────────────┘   │  │
│  └─────────┼───────────────────────┼───────────────────┘  │
│            │                       │                      │
│  ┌─────────▼───────────────┐       │ HTTPS                │
│  │  Python Sidecar         │       │                      │
│  │  ├─ Gateway (8001)      │       │                      │
│  │  ├─ LangGraph (2024)    │       │                      │
│  │  ├─ SQLite checkpointer │       │                      │
│  │  ├─ memory.json         │       │                      │
│  │  └─ Docker sandbox      │       │                      │
│  └─────────────────────────┘       │                      │
└────────────────────────────────────┼──────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │   Cloud Sync Service │
                          │   (FastAPI)          │
                          │   ├─ PostgreSQL      │
                          │   │  ├─ users/auth   │
                          │   │  ├─ checkpoints  │
                          │   │  ├─ memory       │
                          │   │  └─ settings     │
                          │   └─ S3              │
                          │      └─ artifacts    │
                          └─────────────────────┘
```

## Data Sync Strategy

### Threads (Checkpoints)
- LangGraph checkpoints 是 append-only 链表：每个 checkpoint 有唯一 `checkpoint_id` 和 `parent_checkpoint_id`
- 同步策略：**增量推送**。本地产生新 checkpoint 后，推送到云端。拉取时只拉本地没有的
- 冲突：同一 thread 不会在两台设备同时运行（agent 执行是本地的），所以不存在写冲突
- 设备 A 跑完任务 → sync 推送 → 设备 B 拉取 → 继续

### Memory
- memory.json 有 `lastUpdated` 时间戳和 `facts[].createdAt`
- 同步策略：**字段级合并**
  - `user.*` / `history.*` 各 section 有独立 `updatedAt`，取最新的
  - `facts[]` 按 `id` 合并：两端都有的取 confidence 更高的，单端有的直接加入
  - 删除用 tombstone（`deletedAt` 字段），同步后双端都删

### Artifacts
- 文件类数据，用 content-hash 做 key 存 S3
- 只在用户主动切换设备时按需拉取，不全量同步

### Settings / Preferences
- 简单 key-value，last-write-wins

---

## Phase 0: 前置准备

### Task 0.1: 项目结构调整

**Files:**
- Create: `desktop/` — Tauri 项目根目录
- Create: `sync-service/` — 云端同步服务
- Modify: `Makefile` — 添加桌面端和同步服务的 make targets

**Step 1: 创建目录结构**

```bash
mkdir -p desktop/src-tauri/src
mkdir -p desktop/src-tauri/icons
mkdir -p sync-service/app
mkdir -p sync-service/tests
```

**Step 2: 更新 .gitignore**

追加：
```
# Desktop
desktop/src-tauri/target/
desktop/src-tauri/gen/

# Sync service
sync-service/.venv/
```

**Step 3: Commit**

```bash
git add desktop/ sync-service/ .gitignore
git commit -m "chore: scaffold desktop and sync-service directories"
```

---

## Phase 1: Tauri Desktop Shell + Python Sidecar

> 目标：用户双击 app 就能用，不需要装 Docker、不需要命令行。
> 预估工期：1.5 ~ 2 周

### Task 1.1: 初始化 Tauri 2.x 项目

**Files:**
- Create: `desktop/src-tauri/Cargo.toml`
- Create: `desktop/src-tauri/tauri.conf.json`
- Create: `desktop/src-tauri/src/main.rs`
- Create: `desktop/src-tauri/capabilities/default.json`

**Step 1: 安装 Tauri CLI**

```bash
cargo install create-tauri-app
# 或者用 pnpm
pnpm add -D @tauri-apps/cli@latest
```

**Step 2: 创建 tauri.conf.json**

核心配置 — WebView 指向本地 Next.js dev server（开发时）或 bundled 静态文件（生产时）：

```json
{
  "$schema": "https://raw.githubusercontent.com/nicedoc/tauri/v2/tooling/cli/schema.json",
  "productName": "DeerFlow",
  "version": "2.0.0",
  "identifier": "com.deerflow.app",
  "build": {
    "frontendDist": "../frontend/out",
    "devUrl": "http://localhost:3000",
    "beforeDevCommand": "",
    "beforeBuildCommand": ""
  },
  "app": {
    "title": "DeerFlow",
    "windows": [
      {
        "title": "DeerFlow",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": [],
    "externalBin": ["binaries/deerflow-backend"]
  }
}
```

关键点：
- `frontendDist` 指向 Next.js 的 static export 输出目录
- `externalBin` 声明 Python 后端 sidecar 二进制

**Step 3: 创建 main.rs — sidecar 生命周期管理**

```rust
// desktop/src-tauri/src/main.rs
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::sync::Mutex;

struct BackendState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

#[tauri::command]
async fn backend_health() -> Result<String, String> {
    let client = reqwest::Client::new();
    match client.get("http://localhost:8001/health").send().await {
        Ok(resp) => Ok(resp.text().await.unwrap_or_default()),
        Err(e) => Err(format!("Backend not ready: {}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 启动 Python sidecar
            let sidecar = app.shell()
                .sidecar("deerflow-backend")
                .expect("failed to create sidecar command");

            let (mut rx, child) = sidecar.spawn()
                .expect("failed to spawn sidecar");

            // 监听 sidecar stdout/stderr
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                            println!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                            eprintln!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });

            app.manage(BackendState {
                child: Mutex::new(Some(child)),
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // app 关闭时 kill sidecar
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<BackendState>();
                if let Some(child) = state.child.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![backend_health])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 4: Commit**

```bash
git add desktop/
git commit -m "feat(desktop): initialize Tauri 2.x shell with sidecar lifecycle"
```

---

### Task 1.2: Python 后端打包为 Sidecar

**Files:**
- Create: `backend/scripts/build-sidecar.sh`
- Modify: `backend/pyproject.toml` — 添加 PyInstaller 依赖

> 这是整个项目技术风险最高的部分。Python 打包坑多，需要尽早验证。

**Step 1: 选择打包方案**

两个选项，推荐 PyInstaller：

| 方案 | 优点 | 缺点 |
|------|------|------|
| PyInstaller | 成熟、社区大、支持 LangChain 生态 | 包体大（~200MB+），启动慢 |
| 内嵌 Python runtime | 包体小，启动快 | 需要自己管理 venv，复杂度高 |

**Step 2: 创建 PyInstaller spec**

```python
# backend/deerflow-desktop.spec
# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

block_cipher = None

# 收集 LangChain/LangGraph 的隐式依赖
hiddenimports = [
    'langgraph.checkpoint.sqlite',
    'langgraph.checkpoint.sqlite.aio',
    'langchain_openai',
    'langchain_anthropic',
    'langchain_google_genai',
    'tiktoken_ext.openai_public',
    'tiktoken_ext',
    'aiosqlite',
    'uvicorn.logging',
    'uvicorn.protocols.http.auto',
]

a = Analysis(
    ['app/gateway/main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('packages/', 'packages/'),
        ('config.yaml', '.'),
        ('langgraph.json', '.'),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='deerflow-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # 需要 console 输出给 Tauri 捕获
)

coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='deerflow-backend',
)
```

**Step 3: 创建构建脚本**

```bash
#!/bin/bash
# backend/scripts/build-sidecar.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BACKEND_DIR"

echo "==> Installing build dependencies..."
uv pip install pyinstaller

echo "==> Building sidecar binary..."
pyinstaller deerflow-desktop.spec --clean --noconfirm

echo "==> Copying to Tauri binaries directory..."
TAURI_BIN_DIR="../desktop/src-tauri/binaries"
mkdir -p "$TAURI_BIN_DIR"

# Tauri sidecar 命名规范: {name}-{target_triple}
TRIPLE=$(rustc -vV | grep host | cut -d' ' -f2)
cp -r dist/deerflow-backend "$TAURI_BIN_DIR/deerflow-backend-$TRIPLE"

echo "==> Done. Sidecar at: $TAURI_BIN_DIR/deerflow-backend-$TRIPLE"
```

**Step 4: 验证打包可行性**

```bash
cd backend
bash scripts/build-sidecar.sh
# 直接运行验证
./dist/deerflow-backend/deerflow-backend
# 检查 http://localhost:8001/health 是否返回 200
curl http://localhost:8001/health
```

**Step 5: Commit**

```bash
git add backend/deerflow-desktop.spec backend/scripts/build-sidecar.sh
git commit -m "feat(desktop): add PyInstaller sidecar build for Python backend"
```

---

### Task 1.3: Next.js Static Export 适配

**Files:**
- Modify: `frontend/next.config.ts` — 启用 static export
- Modify: `frontend/src/env.js` — 允许 Tauri 环境下的 API URL 配置
- Create: `frontend/scripts/build-desktop.sh`

> Next.js App Router 的 static export 有限制：不能用 Server Actions、动态路由需要 generateStaticParams。
> 但 DeerFlow 前端主要是 CSR（客户端渲染），API 调用走 fetch，所以影响不大。

**Step 1: 配置 static export**

在 `next.config.ts` 中添加 desktop build 模式：

```typescript
// 在 nextConfig 中添加条件 export
const nextConfig = {
  // ... existing config
  ...(process.env.BUILD_TARGET === 'desktop' ? {
    output: 'export',
    // static export 不支持 image optimization
    images: { unoptimized: true },
  } : {}),
};
```

**Step 2: API URL 动态化**

前端需要知道本地后端的地址。在 Tauri 环境下，API 指向 `http://localhost:8001`（Gateway）和 `http://localhost:2024`（LangGraph）：

```typescript
// frontend/src/lib/api-config.ts
export function getBackendBaseUrl(): string {
  // Tauri 环境：直连本地后端，不经过 Nginx
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return 'http://localhost:8001';
  }
  // Web 环境：走 Nginx 代理
  return process.env.NEXT_PUBLIC_BACKEND_BASE_URL || '';
}

export function getLangGraphBaseUrl(): string {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return 'http://localhost:2024';
  }
  return process.env.NEXT_PUBLIC_LANGGRAPH_BASE_URL || `${window.location.origin}/api/langgraph`;
}
```

**Step 3: 构建脚本**

```bash
#!/bin/bash
# frontend/scripts/build-desktop.sh
set -e
cd "$(dirname "$0")/.."

echo "==> Building Next.js for desktop (static export)..."
BUILD_TARGET=desktop pnpm build

echo "==> Output at: out/"
ls -la out/
```

**Step 4: 验证 static export**

```bash
cd frontend
BUILD_TARGET=desktop pnpm build
# 用 serve 验证
npx serve out -p 3000
# 打开 http://localhost:3000 检查页面是否正常加载
```

**Step 5: Commit**

```bash
git add frontend/next.config.ts frontend/src/lib/api-config.ts frontend/scripts/build-desktop.sh
git commit -m "feat(desktop): add Next.js static export mode for Tauri"
```

---

### Task 1.4: 去掉 Nginx 依赖

**Context:**
Web 部署时 Nginx 做反向代理，把 `/api/langgraph/*` 转发到 LangGraph Server，`/api/*` 转发到 Gateway。
桌面端不需要 Nginx —— 前端直连本地端口。但需要处理 CORS。

**Files:**
- Modify: `backend/app/gateway/main.py` — 添加 CORS middleware for desktop mode
- Modify: LangGraph Server 启动配置 — 添加 CORS

**Step 1: Gateway 添加 CORS**

```python
# backend/app/gateway/main.py — 在 app 创建后添加
from fastapi.middleware.cors import CORSMiddleware

if os.getenv("DEERFLOW_DESKTOP_MODE"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["tauri://localhost", "http://localhost:*", "https://tauri.localhost"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
```

**Step 2: Commit**

```bash
git add backend/app/gateway/main.py
git commit -m "feat(desktop): add CORS support for Tauri WebView"
```

---

### Task 1.5: 端到端验证 — 桌面端跑起来

**Step 1: 构建前端**

```bash
cd frontend && BUILD_TARGET=desktop pnpm build
```

**Step 2: 构建后端 sidecar**

```bash
cd backend && bash scripts/build-sidecar.sh
```

**Step 3: 启动 Tauri dev 模式**

```bash
cd desktop && cargo tauri dev
```

**Step 4: 验证清单**

- [ ] App 窗口正常打开
- [ ] 后端 sidecar 自动启动（检查 http://localhost:8001/health）
- [ ] 可以创建新 thread
- [ ] 可以发送消息并收到 streaming 回复
- [ ] 关闭 app 时 sidecar 进程被 kill

**Step 5: Commit**

```bash
git commit -m "feat(desktop): phase 1 complete — local desktop app working"
```

---

## Phase 2: Memory Storage 抽象层

> 目标：把 memory 从硬编码的文件 I/O 解耦出来，支持 file / postgres / remote 多后端。
> 这是后续云同步的前置条件。
> 预估工期：1 周

### Task 2.1: 定义 MemoryStore Protocol

**Files:**
- Create: `backend/packages/harness/deerflow/agents/memory/store.py`
- Test: `backend/packages/harness/tests/memory/test_memory_store.py`

**Step 1: 写 failing test**

```python
# backend/packages/harness/tests/memory/test_memory_store.py
import pytest
from deerflow.agents.memory.store import FileMemoryStore

def test_file_store_roundtrip(tmp_path):
    store = FileMemoryStore(base_dir=tmp_path)
    empty = store.load(user_id="user-1", agent_name=None)
    assert empty["version"] == "1.0"
    assert empty["facts"] == []

    empty["facts"].append({"id": "f1", "content": "test fact", "confidence": 0.9})
    store.save(empty, user_id="user-1", agent_name=None)

    reloaded = store.load(user_id="user-1", agent_name=None)
    assert len(reloaded["facts"]) == 1
    assert reloaded["facts"][0]["id"] == "f1"

def test_file_store_user_isolation(tmp_path):
    store = FileMemoryStore(base_dir=tmp_path)
    m1 = store.load(user_id="user-1", agent_name=None)
    m1["facts"].append({"id": "f1", "content": "user1 fact"})
    store.save(m1, user_id="user-1", agent_name=None)

    m2 = store.load(user_id="user-2", agent_name=None)
    assert m2["facts"] == []  # user-2 不应该看到 user-1 的数据

def test_file_store_agent_isolation(tmp_path):
    store = FileMemoryStore(base_dir=tmp_path)
    m1 = store.load(user_id="user-1", agent_name="agent-a")
    m1["facts"].append({"id": "f1", "content": "agent-a fact"})
    store.save(m1, user_id="user-1", agent_name="agent-a")

    m2 = store.load(user_id="user-1", agent_name="agent-b")
    assert m2["facts"] == []  # 不同 agent 隔离
```

**Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest packages/harness/tests/memory/test_memory_store.py -v
```

Expected: FAIL — `ImportError: cannot import name 'FileMemoryStore'`

**Step 3: 实现 MemoryStore Protocol + FileMemoryStore**

```python
# backend/packages/harness/deerflow/agents/memory/store.py
from __future__ import annotations

import json
import threading
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class MemoryStore(ABC):
    """Abstract interface for memory persistence."""

    @abstractmethod
    def load(self, user_id: str, agent_name: str | None = None) -> dict[str, Any]:
        """Load memory for a given user + agent. Returns empty memory if not found."""
        ...

    @abstractmethod
    def save(self, data: dict[str, Any], user_id: str, agent_name: str | None = None) -> bool:
        """Save memory atomically. Returns True on success."""
        ...

    @abstractmethod
    def exists(self, user_id: str, agent_name: str | None = None) -> bool:
        ...

    @staticmethod
    def create_empty() -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        return {
            "version": "1.0",
            "lastUpdated": now,
            "user": {
                "workContext": {"summary": "", "updatedAt": now},
                "personalContext": {"summary": "", "updatedAt": now},
                "topOfMind": {"summary": "", "updatedAt": now},
            },
            "history": {
                "recentMonths": {"summary": "", "updatedAt": now},
                "earlierContext": {"summary": "", "updatedAt": now},
                "longTermBackground": {"summary": "", "updatedAt": now},
            },
            "facts": [],
        }


class FileMemoryStore(MemoryStore):
    """File-based memory store. Stores as {base_dir}/{user_id}/{agent_name}/memory.json"""

    def __init__(self, base_dir: Path):
        self._base_dir = Path(base_dir)
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[dict[str, Any], float | None]] = {}

    def _path(self, user_id: str, agent_name: str | None) -> Path:
        parts = [self._base_dir, user_id]
        if agent_name:
            parts.append(agent_name)
        parts.append("memory.json")
        return Path(*[str(p) for p in parts])

    def _cache_key(self, user_id: str, agent_name: str | None) -> str:
        return f"{user_id}:{agent_name or '_default'}"

    def load(self, user_id: str, agent_name: str | None = None) -> dict[str, Any]:
        path = self._path(user_id, agent_name)
        key = self._cache_key(user_id, agent_name)

        if not path.exists():
            return self.create_empty()

        mtime = path.stat().st_mtime
        if key in self._cache:
            cached_data, cached_mtime = self._cache[key]
            if cached_mtime == mtime:
                return cached_data

        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        self._cache[key] = (data, mtime)
        return data

    def save(self, data: dict[str, Any], user_id: str, agent_name: str | None = None) -> bool:
        path = self._path(user_id, agent_name)
        key = self._cache_key(user_id, agent_name)

        with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            tmp.replace(path)
            self._cache[key] = (data, path.stat().st_mtime)
        return True

    def exists(self, user_id: str, agent_name: str | None = None) -> bool:
        return self._path(user_id, agent_name).exists()
```

**Step 4: Run tests**

```bash
cd backend && uv run pytest packages/harness/tests/memory/test_memory_store.py -v
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/harness/deerflow/agents/memory/store.py packages/harness/tests/memory/
git commit -m "feat(memory): add MemoryStore protocol with FileMemoryStore implementation"
```

---

### Task 2.2: 迁移 updater.py 到 MemoryStore

**Files:**
- Modify: `backend/packages/harness/deerflow/agents/memory/updater.py`
- Modify: `backend/packages/harness/deerflow/agents/memory/queue.py`
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`
- Modify: `backend/app/gateway/routers/memory.py`

**Step 1: 改造 updater.py**

替换所有 `_load_memory_from_file` / `_save_memory_to_file` 调用为 `MemoryStore` 方法。

关键改动点（4 处）：

```python
# updater.py — 改造前
def get_memory_data(agent_name: str | None = None) -> dict[str, Any]:
    return _load_memory_from_file(agent_name)

# updater.py — 改造后
_store: MemoryStore | None = None

def init_memory_store(store: MemoryStore) -> None:
    global _store
    _store = store

def get_memory_data(user_id: str, agent_name: str | None = None) -> dict[str, Any]:
    assert _store is not None, "MemoryStore not initialized. Call init_memory_store() first."
    return _store.load(user_id=user_id, agent_name=agent_name)
```

同样改造 `MemoryUpdater.update_memory()` 和 `reload_memory_data()`，所有入口都加 `user_id` 参数。

**Step 2: 改造 memory_middleware.py**

`MemoryMiddleware.after_agent()` 需要从 runtime context 拿 `user_id`：

```python
# 改造前
queue.add(thread_id, filtered_messages, agent_name=agent_name)

# 改造后
user_id = runtime.context.get("user_id", "local-user")
queue.add(thread_id, filtered_messages, agent_name=agent_name, user_id=user_id)
```

**Step 3: 改造 memory router**

```python
# 改造前
async def get_memory(auth: AuthContext = Depends(get_auth_context)):
    memory_data = get_memory_data()

# 改造后
async def get_memory(auth: AuthContext = Depends(get_auth_context)):
    memory_data = get_memory_data(user_id=auth.user_id)
```

**Step 4: 初始化 store**

在 Gateway 启动时初始化：

```python
# backend/app/gateway/main.py — startup
from deerflow.agents.memory.store import FileMemoryStore
from deerflow.agents.memory.updater import init_memory_store

store = FileMemoryStore(base_dir=Path(os.getenv("DEER_FLOW_HOME", ".deer-flow")) / "memory")
init_memory_store(store)
```

**Step 5: 运行现有测试确保不 break**

```bash
cd backend && uv run pytest -x -v
```

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(memory): migrate to MemoryStore abstraction, add user_id scoping"
```

---

## Phase 3: Thread 用户归属 + Auth 穿透

> 目标：每个 thread 有明确的 owner，用户只能看到自己的 thread。Auth 信息从前端一路传到 LangGraph runtime。
> 预估工期：1 周

### Task 3.1: Thread 创建时写入 user_id metadata

**Files:**
- Modify: `frontend/src/core/threads/hooks.ts` — submit 时注入 user_id
- Modify: `frontend/src/core/threads/types.ts` — 扩展 context 类型

**Context:**
LangGraph SDK 的 `threads.create()` 支持 `metadata` 字段，`threads.search()` 支持按 metadata 过滤。
不需要改 LangGraph Server 代码，只需要前端在创建/查询时带上 metadata。

**Step 1: 扩展 AgentThreadContext**

```typescript
// frontend/src/core/threads/types.ts
interface AgentThreadContext extends Record<string, unknown> {
  thread_id: string;
  model_name: string | undefined;
  thinking_enabled: boolean;
  is_plan_mode: boolean;
  subagent_enabled: boolean;
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  agent_name?: string;
  user_id?: string;   // ← 新增
  org_id?: string;    // ← 新增
}
```

**Step 2: 前端 submit 时注入 user identity**

在 `useStream` 的 config 中注入当前用户信息。用户信息从 auth session 获取：

```typescript
// frontend/src/core/threads/hooks.ts — useAgentStream 内部
// submit 时的 context 添加 user_id
context: {
  ...context,
  thread_id: threadId,
  user_id: session?.user?.id,    // ← 从 auth session 获取
  org_id: session?.org?.id,
},
```

**Step 3: Thread 创建时写 metadata**

LangGraph SDK 的 `useStream` 在首次 submit 时自动创建 thread。需要确认 `onCreated` 回调中 thread 已带上 metadata。

如果 `useStream` 不支持在创建时传 metadata，则需要改为手动创建：

```typescript
// 手动创建 thread 并写入 metadata
const thread = await apiClient.threads.create({
  metadata: {
    user_id: session.user.id,
    org_id: session.org.id,
    created_at: new Date().toISOString(),
  },
});
```

**Step 4: Commit**

```bash
git add frontend/src/core/threads/
git commit -m "feat(threads): inject user_id/org_id into thread metadata on creation"
```

---

### Task 3.2: Thread 查询按 user_id 过滤

**Files:**
- Modify: `frontend/src/core/threads/hooks.ts` — `useThreads` 添加 metadata filter

**Step 1: 修改 useThreads**

```typescript
// frontend/src/core/threads/hooks.ts
export function useThreads(userId: string | undefined) {
  return useQuery({
    queryKey: ["threads", "search", userId],
    queryFn: async () => {
      const result = await apiClient.threads.search({
        limit: 50,
        sortBy: "updated_at",
        sortOrder: "desc",
        select: ["thread_id", "updated_at", "values"],
        metadata: userId ? { user_id: userId } : undefined,  // ← 按 user 过滤
      });
      return result;
    },
    enabled: !!userId,
  });
}
```

**Step 2: 验证**

- 用 user-A 创建几个 thread
- 用 user-B 登录，确认看不到 user-A 的 thread
- 用 user-A 登录，确认只看到自己的 thread

**Step 3: Commit**

```bash
git add frontend/src/core/threads/hooks.ts
git commit -m "feat(threads): filter thread list by user_id metadata"
```

---

### Task 3.3: Auth Context 穿透到 LangGraph Runtime

**Files:**
- Modify: `frontend/src/core/threads/hooks.ts` — context 带 user_id
- Modify: `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py` — 从 context 读 user_id
- Modify: `backend/packages/harness/deerflow/agents/middlewares/thread_data_middleware.py` — 按 user 隔离 workspace

**Context:**
LangGraph 的 `config.configurable` 可以传任意 key-value，前端通过 `context` 字段传入，
middleware 通过 `runtime.context.get("user_id")` 读取。

**Step 1: 前端 context 注入 user_id（已在 Task 3.1 完成）**

确认 submit 的 `context` 中包含 `user_id`。

**Step 2: MemoryMiddleware 使用 user_id**

```python
# memory_middleware.py — after_agent
user_id = runtime.context.get("user_id", "local-user")
queue.add(
    thread_id=thread_id,
    messages=filtered_messages,
    agent_name=agent_name,
    user_id=user_id,  # ← 传递给 memory queue
)
```

**Step 3: ThreadDataMiddleware 按 user 隔离 workspace**

```python
# thread_data_middleware.py — before_agent
user_id = runtime.context.get("user_id", "local-user")
# workspace 路径: {base_dir}/users/{user_id}/threads/{thread_id}/
workspace_base = base_dir / "users" / user_id / "threads" / thread_id
```

这确保不同用户的 artifacts、uploads 物理隔离。

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): propagate user_id through LangGraph runtime context"
```

---

## Phase 4: Cloud Sync Service

> 目标：部署一个轻量 API 服务，只做数据存储和同步，不跑任何 agent 计算。
> 这是整个架构里最"笨"的一层 —— 接收数据、存起来、按需返回。
> 预估工期：2 ~ 3 周

### Task 4.1: Sync Service 项目初始化

**Files:**
- Create: `sync-service/pyproject.toml`
- Create: `sync-service/app/main.py`
- Create: `sync-service/app/models.py`
- Create: `sync-service/app/auth.py`
- Create: `sync-service/Dockerfile`
- Create: `sync-service/docker-compose.yaml`

**Step 1: pyproject.toml**

```toml
[project]
name = "deerflow-sync"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.30",
    "pyjwt>=2.9",
    "bcrypt>=4.2",
    "boto3>=1.35",
    "pydantic>=2.10",
]

[tool.uv]
dev-dependencies = ["pytest>=8.0", "httpx>=0.28", "pytest-asyncio>=0.24"]
```

**Step 2: 数据库 Models**

```python
# sync-service/app/models.py
from sqlalchemy import Column, String, Text, DateTime, Integer, LargeBinary, JSON, Index
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id = Column(String(64), primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Device(Base):
    __tablename__ = "devices"
    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    name = Column(String(255))
    last_sync_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SyncedCheckpoint(Base):
    """镜像 LangGraph 的 checkpoints 表，加上 user_id"""
    __tablename__ = "synced_checkpoints"
    user_id = Column(String(64), nullable=False)
    thread_id = Column(String(64), nullable=False)
    checkpoint_ns = Column(Text, nullable=False, default="")
    checkpoint_id = Column(String(64), nullable=False)
    parent_checkpoint_id = Column(String(64))
    type = Column(Text)
    checkpoint = Column(LargeBinary)  # 序列化的 checkpoint blob
    metadata = Column(LargeBinary)
    synced_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("pk_synced_checkpoints",
              "user_id", "thread_id", "checkpoint_ns", "checkpoint_id",
              unique=True),
    )

class SyncedWrite(Base):
    """镜像 LangGraph 的 writes 表"""
    __tablename__ = "synced_writes"
    user_id = Column(String(64), nullable=False)
    thread_id = Column(String(64), nullable=False)
    checkpoint_ns = Column(Text, nullable=False, default="")
    checkpoint_id = Column(String(64), nullable=False)
    task_id = Column(String(64), nullable=False)
    idx = Column(Integer, nullable=False)
    channel = Column(Text, nullable=False)
    type = Column(Text)
    value = Column(LargeBinary)

    __table_args__ = (
        Index("pk_synced_writes",
              "user_id", "thread_id", "checkpoint_ns",
              "checkpoint_id", "task_id", "idx",
              unique=True),
    )

class SyncedMemory(Base):
    __tablename__ = "synced_memory"
    user_id = Column(String(64), nullable=False)
    agent_name = Column(String(255), nullable=False, default="_default")
    data = Column(JSON, nullable=False)  # 完整 memory JSON
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    version = Column(Integer, default=1)  # 乐观锁

    __table_args__ = (
        Index("pk_synced_memory", "user_id", "agent_name", unique=True),
    )

class SyncedSettings(Base):
    __tablename__ = "synced_settings"
    user_id = Column(String(64), nullable=False)
    key = Column(String(255), nullable=False)
    value = Column(JSON)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("pk_synced_settings", "user_id", "key", unique=True),
    )
```

**Step 3: Commit**

```bash
git add sync-service/
git commit -m "feat(sync): initialize sync service with DB models"
```

---

### Task 4.2: Sync API Endpoints

**Files:**
- Create: `sync-service/app/routers/checkpoints.py`
- Create: `sync-service/app/routers/memory.py`
- Create: `sync-service/app/routers/settings.py`
- Create: `sync-service/app/auth.py`

**Step 1: Auth — JWT-based**

桌面端登录后拿到 JWT，后续所有 sync 请求带 `Authorization: Bearer <token>`。

```python
# sync-service/app/auth.py
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("SYNC_JWT_SECRET", "change-me-in-production")
ALGORITHM = "HS256"

security = HTTPBearer()

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

**Step 2: Checkpoint Sync Endpoints**

核心思路：客户端告诉云端"我本地最新的 checkpoint_id 是什么"，云端返回"你缺的 checkpoints"。
客户端推送时，批量上传新 checkpoints。

```python
# sync-service/app/routers/checkpoints.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel

router = APIRouter(prefix="/sync/checkpoints", tags=["sync"])

class PushCheckpointsRequest(BaseModel):
    thread_id: str
    checkpoints: list[dict]  # [{checkpoint_id, parent_checkpoint_id, checkpoint_ns, type, checkpoint(base64), metadata(base64)}]
    writes: list[dict]       # [{checkpoint_id, task_id, idx, channel, type, value(base64)}]

class PullCheckpointsRequest(BaseModel):
    thread_id: str
    latest_checkpoint_id: str | None  # 客户端本地最新的 checkpoint_id，None 表示全量拉取

class ThreadListRequest(BaseModel):
    since: str | None = None  # ISO timestamp，只返回此时间之后更新的 threads

@router.post("/push")
async def push_checkpoints(
    req: PushCheckpointsRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """客户端推送新 checkpoints 到云端"""
    for cp in req.checkpoints:
        await db.execute(
            insert(SyncedCheckpoint)
            .values(user_id=user_id, thread_id=req.thread_id, **cp)
            .on_conflict_do_nothing()  # 幂等：已存在则跳过
        )
    for w in req.writes:
        await db.execute(
            insert(SyncedWrite)
            .values(user_id=user_id, thread_id=req.thread_id, **w)
            .on_conflict_do_nothing()
        )
    await db.commit()
    return {"status": "ok", "synced": len(req.checkpoints)}

@router.post("/pull")
async def pull_checkpoints(
    req: PullCheckpointsRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """客户端拉取缺失的 checkpoints"""
    query = select(SyncedCheckpoint).where(
        SyncedCheckpoint.user_id == user_id,
        SyncedCheckpoint.thread_id == req.thread_id,
    )
    if req.latest_checkpoint_id:
        # 只返回比客户端最新 checkpoint 更新的
        # checkpoint_id 是 uuid6-based，天然有序
        query = query.where(
            SyncedCheckpoint.checkpoint_id > req.latest_checkpoint_id
        )
    query = query.order_by(SyncedCheckpoint.checkpoint_id.asc())

    result = await db.execute(query)
    checkpoints = result.scalars().all()

    # 同时拉取对应的 writes
    cp_ids = [cp.checkpoint_id for cp in checkpoints]
    writes_query = select(SyncedWrite).where(
        SyncedWrite.user_id == user_id,
        SyncedWrite.thread_id == req.thread_id,
        SyncedWrite.checkpoint_id.in_(cp_ids),
    )
    writes_result = await db.execute(writes_query)

    return {
        "checkpoints": [serialize(cp) for cp in checkpoints],
        "writes": [serialize(w) for w in writes_result.scalars().all()],
    }

@router.post("/threads")
async def list_synced_threads(
    req: ThreadListRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出用户所有 synced threads（用于新设备首次同步）"""
    query = (
        select(
            SyncedCheckpoint.thread_id,
            func.max(SyncedCheckpoint.synced_at).label("last_synced"),
            func.count(SyncedCheckpoint.checkpoint_id).label("checkpoint_count"),
        )
        .where(SyncedCheckpoint.user_id == user_id)
        .group_by(SyncedCheckpoint.thread_id)
        .order_by(func.max(SyncedCheckpoint.synced_at).desc())
    )
    if req.since:
        query = query.having(func.max(SyncedCheckpoint.synced_at) > req.since)

    result = await db.execute(query)
    return {"threads": [dict(row._mapping) for row in result]}
```

**Step 3: Memory Sync Endpoint**

```python
# sync-service/app/routers/memory.py
router = APIRouter(prefix="/sync/memory", tags=["sync"])

class MemorySyncRequest(BaseModel):
    agent_name: str = "_default"
    data: dict          # 完整 memory JSON
    updated_at: str     # ISO timestamp
    version: int        # 乐观锁版本号

@router.post("/push")
async def push_memory(
    req: MemorySyncRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """推送 memory 到云端。用字段级合并避免覆盖。"""
    existing = await db.execute(
        select(SyncedMemory).where(
            SyncedMemory.user_id == user_id,
            SyncedMemory.agent_name == req.agent_name,
        )
    )
    row = existing.scalar_one_or_none()

    if row is None:
        # 首次同步，直接写入
        db.add(SyncedMemory(
            user_id=user_id,
            agent_name=req.agent_name,
            data=req.data,
            updated_at=req.updated_at,
            version=1,
        ))
    else:
        # 字段级合并
        merged = merge_memory(row.data, req.data)
        row.data = merged
        row.updated_at = max(row.updated_at.isoformat(), req.updated_at)
        row.version += 1

    await db.commit()
    return {"status": "ok", "version": row.version if row else 1}

@router.get("/pull")
async def pull_memory(
    agent_name: str = "_default",
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SyncedMemory).where(
            SyncedMemory.user_id == user_id,
            SyncedMemory.agent_name == agent_name,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return {"data": None, "version": 0}
    return {"data": row.data, "version": row.version, "updated_at": row.updated_at}


def merge_memory(cloud: dict, local: dict) -> dict:
    """字段级合并策略"""
    merged = dict(cloud)

    # user.* / history.* — 各 section 按 updatedAt 取最新
    for section in ["user", "history"]:
        if section in local:
            for key, val in local[section].items():
                cloud_val = merged.get(section, {}).get(key, {})
                if val.get("updatedAt", "") > cloud_val.get("updatedAt", ""):
                    merged.setdefault(section, {})[key] = val

    # facts — 按 id 合并
    cloud_facts = {f["id"]: f for f in merged.get("facts", [])}
    for fact in local.get("facts", []):
        fid = fact["id"]
        if fid in cloud_facts:
            # 两端都有：取 confidence 更高的
            if fact.get("confidence", 0) >= cloud_facts[fid].get("confidence", 0):
                cloud_facts[fid] = fact
        else:
            # 本地新增
            if not fact.get("deletedAt"):  # 跳过已删除的
                cloud_facts[fid] = fact

    # 清理 tombstone
    merged["facts"] = [f for f in cloud_facts.values() if not f.get("deletedAt")]
    merged["lastUpdated"] = max(cloud.get("lastUpdated", ""), local.get("lastUpdated", ""))

    return merged
```

**Step 4: Commit**

```bash
git add sync-service/app/
git commit -m "feat(sync): add checkpoint and memory sync API endpoints"
```

---

### Task 4.3: Sync Service 部署

**Files:**
- Create: `sync-service/Dockerfile`
- Create: `sync-service/docker-compose.yaml`

**Step 1: Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app/ app/
EXPOSE 8080
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Step 2: docker-compose.yaml**

```yaml
services:
  sync-api:
    build: .
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: postgresql+asyncpg://sync:sync@postgres:5432/deerflow_sync
      SYNC_JWT_SECRET: ${SYNC_JWT_SECRET}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      S3_BUCKET: ${S3_BUCKET:-deerflow-artifacts}
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sync
      POSTGRES_PASSWORD: sync
      POSTGRES_DB: deerflow_sync
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sync"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

**Step 3: 验证**

```bash
cd sync-service
docker compose up -d
curl http://localhost:8080/health
```

**Step 4: Commit**

```bash
git add sync-service/Dockerfile sync-service/docker-compose.yaml
git commit -m "feat(sync): add Docker deployment for sync service"
```

---

## Phase 5: Client-side Sync Engine

> 目标：在 Tauri 客户端内实现后台同步逻辑，自动将本地 checkpoint/memory 推送到云端，新设备登录后自动拉取。
> 支持离线使用，上线后自动补同步。
> 预估工期：2 ~ 3 周

### Task 5.1: Sync Engine 核心 — Rust 侧

**Files:**
- Create: `desktop/src-tauri/src/sync/mod.rs`
- Create: `desktop/src-tauri/src/sync/checkpoint_sync.rs`
- Create: `desktop/src-tauri/src/sync/memory_sync.rs`
- Create: `desktop/src-tauri/src/sync/queue.rs`
- Modify: `desktop/src-tauri/src/main.rs` — 注册 sync 模块
- Modify: `desktop/src-tauri/Cargo.toml` — 添加依赖

**Context:**
Sync Engine 跑在 Tauri 的 Rust 侧，不在 WebView 里。原因：
1. 后台运行，不受页面刷新/关闭影响
2. 可以直接读本地 SQLite checkpointer 文件
3. Rust 的 async runtime 适合做后台定时任务

**Step 1: 添加 Cargo 依赖**

```toml
# desktop/src-tauri/Cargo.toml — [dependencies] 追加
reqwest = { version = "0.12", features = ["json"] }
rusqlite = { version = "0.32", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
base64 = "0.22"
chrono = { version = "0.4", features = ["serde"] }
```

**Step 2: Checkpoint Sync — 读本地 SQLite，推送到云端**

```rust
// desktop/src-tauri/src/sync/checkpoint_sync.rs
use rusqlite::Connection;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[derive(Serialize)]
struct PushRequest {
    thread_id: String,
    checkpoints: Vec<CheckpointRow>,
    writes: Vec<WriteRow>,
}

#[derive(Serialize, Deserialize)]
struct CheckpointRow {
    checkpoint_id: String,
    parent_checkpoint_id: Option<String>,
    checkpoint_ns: String,
    #[serde(rename = "type")]
    type_tag: Option<String>,
    checkpoint: String,  // base64
    metadata: String,    // base64
}

/// 读取本地 SQLite checkpointer，找出尚未同步的 checkpoints
pub async fn sync_thread(
    db_path: &str,
    thread_id: &str,
    cloud_latest_id: Option<&str>,
    sync_url: &str,
    token: &str,
) -> Result<usize, Box<dyn std::error::Error>> {
    let conn = Connection::open(db_path)?;

    // 查询本地比云端更新的 checkpoints
    let mut stmt = if let Some(latest) = cloud_latest_id {
        conn.prepare(
            "SELECT checkpoint_id, parent_checkpoint_id, checkpoint_ns, type, checkpoint, metadata
             FROM checkpoints
             WHERE thread_id = ?1 AND checkpoint_id > ?2
             ORDER BY checkpoint_id ASC"
        )?
    } else {
        conn.prepare(
            "SELECT checkpoint_id, parent_checkpoint_id, checkpoint_ns, type, checkpoint, metadata
             FROM checkpoints
             WHERE thread_id = ?1
             ORDER BY checkpoint_id ASC"
        )?
    };

    let params: Vec<&dyn rusqlite::types::ToSql> = if let Some(latest) = cloud_latest_id {
        vec![&thread_id, &latest]
    } else {
        vec![&thread_id]
    };

    let rows: Vec<CheckpointRow> = stmt.query_map(params.as_slice(), |row| {
        let cp_blob: Vec<u8> = row.get(4)?;
        let meta_blob: Vec<u8> = row.get(5)?;
        Ok(CheckpointRow {
            checkpoint_id: row.get(0)?,
            parent_checkpoint_id: row.get(1)?,
            checkpoint_ns: row.get(2)?,
            type_tag: row.get(3)?,
            checkpoint: BASE64.encode(&cp_blob),
            metadata: BASE64.encode(&meta_blob),
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    if rows.is_empty() {
        return Ok(0);
    }

    let count = rows.len();

    // 推送到云端
    let client = Client::new();
    client.post(format!("{}/sync/checkpoints/push", sync_url))
        .bearer_auth(token)
        .json(&PushRequest {
            thread_id: thread_id.to_string(),
            checkpoints: rows,
            writes: vec![],  // TODO: 同步 writes 表
        })
        .send()
        .await?
        .error_for_status()?;

    Ok(count)
}
```

**Step 3: Sync Scheduler — 后台定时同步**

```rust
// desktop/src-tauri/src/sync/mod.rs
pub mod checkpoint_sync;
pub mod memory_sync;

use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};

pub struct SyncState {
    pub sync_url: String,
    pub token: RwLock<Option<String>>,
    pub db_path: String,
    pub memory_dir: String,
    pub enabled: RwLock<bool>,
}

/// 启动后台同步循环
pub async fn start_sync_loop(state: Arc<SyncState>) {
    let mut ticker = interval(Duration::from_secs(30)); // 每 30 秒同步一次

    loop {
        ticker.tick().await;

        let enabled = *state.enabled.read().await;
        if !enabled {
            continue;
        }

        let token = state.token.read().await.clone();
        let Some(token) = token else { continue };

        // 同步所有本地 threads
        if let Err(e) = sync_all_threads(&state, &token).await {
            eprintln!("[sync] checkpoint sync error: ", e);
        }

        // 同步 memory
        if let Err(e) = memory_sync::sync_memory(
            &state.memory_dir, &state.sync_url, &token
        ).await {
            eprintln!("[sync] memory sync error: {}", e);
        }
    }
}

async fn sync_all_threads(
    state: &SyncState,
    token: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let conn = rusqlite::Connection::open(&state.db_path)?;

    // 获取所有本地 thread_id
    let mut stmt = conn.prepare(
        "SELECT DISTINCT thread_id FROM checkpoints"
    )?;
    let thread_ids: Vec<String> = stmt.query_map([], |row| {
        row.get(0)
    })?.collect::<Result<Vec<_>, _>>()?;

    for tid in thread_ids {
        // TODO: 记录每个 thread 上次同步的 checkpoint_id，避免重复查询
        // 暂时用 None 表示全量检查（云端会 on_conflict_do_nothing）
        match checkpoint_sync::sync_thread(
            &state.db_path, &tid, None, &state.sync_url, token
        ).await {
            Ok(n) if n > 0 => println!("[sync] pushed {} checkpoints for thread {}", n, tid),
            Err(e) => eprintln!("[sync] thread {} error: {}", tid, e),
            _ => {}
        }
    }
    Ok(())
}
```

**Step 4: 注册到 Tauri main.rs**

```rust
// main.rs — setup 中添加
let sync_state = Arc::new(sync::SyncState {
    sync_url: std::env::var("DEERFLOW_SYNC_URL")
        .unwrap_or_else(|_| "https://sync.deerflow.com".to_string()),
    token: RwLock::new(None),
    db_path: home_dir.join(".deer-flow/checkpoints.db").to_string_lossy().to_string(),
    memory_dir: home_dir.join(".deer-flow/memory").to_string_lossy().to_string(),
    enabled: RwLock::new(false),
});

let sync_state_clone = sync_state.clone();
tauri::async_runtime::spawn(async move {
    sync::start_sync_loop(sync_state_clone).await;
});

app.manage(sync_state);
```

**Step 5: Commit**

```bash
git add desktop/src-tauri/
git commit -m "feat(sync): implement client-side sync engine in Rust"
```

---

### Task 5.2: 新设备首次同步（Pull Flow）

**Context:**
用户在新设备上首次登录时，需要从云端拉取所有 threads 和 memory 到本地。
这是 sync 的反向流程。

**Files:**
- Create: `desktop/src-tauri/src/sync/pull.rs`
- Modify: `desktop/src-tauri/src/sync/mod.rs`

**Step 1: Pull 逻辑**

```rust
// desktop/src-tauri/src/sync/pull.rs
use rusqlite::Connection;
use reqwest::Client;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

/// 从云端拉取所有 threads 到本地 SQLite
pub async fn pull_all_threads(
    db_path: &str,
    sync_url: &str,
    token: &str,
) -> Result<usize, Box<dyn std::error::Error>> {
    let client = Client::new();

    // 1. 获取云端 thread 列表
    let resp: serde_json::Value = client
        .post(format!("{}/sync/checkpoints/threads", sync_url))
        .bearer_auth(token)
        .json(&serde_json::json!({"since": null}))
        .send().await?
        .json().await?;

    let threads = resp["threads"].as_array().unwrap_or(&vec![]);
    let mut total = 0;

    // 2. 逐个 thread 拉取 checkpoints
    let conn = Connection::open(db_path)?;
    for thread in threads {
        let thread_id = thread["thread_id"].as_str().unwrap();

        // 查本地最新 checkpoint_id
        let local_latest: Option<String> = conn.query_row(
            "SELECT checkpoint_id FROM checkpoints WHERE thread_id = ?1
             ORDER BY checkpoint_id DESC LIMIT 1",
            [thread_id],
            |row| row.get(0),
        ).ok();

        // 拉取缺失的
        let pull_resp: serde_json::Value = client
            .post(format!("{}/sync/checkpoints/pull", sync_url))
            .bearer_auth(token)
            .json(&serde_json::json!({
                "thread_id": thread_id,
                "latest_checkpoint_id": local_latest,
            }))
            .send().await?
            .json().await?;

        let checkpoints = pull_resp["checkpoints"].as_array().unwrap_or(&vec![]);

        // 写入本地 SQLite
        for cp in checkpoints {
            let blob = BASE64.decode(cp["checkpoint"].as_str().unwrap_or(""))?;
            let meta = BASE64.decode(cp["metadata"].as_str().unwrap_or(""))?;

            conn.execute(
                "INSERT OR IGNORE INTO checkpoints
                 (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    thread_id,
                    cp["checkpoint_ns"].as_str().unwrap_or(""),
                    cp["checkpoint_id"].as_str().unwrap(),
                    cp["parent_checkpoint_id"].as_str(),
                    cp["type"].as_str(),
                    blob,
                    meta,
                ],
            )?;
            total += 1;
        }
    }

    Ok(total)
}
```

**Step 2: 暴露为 Tauri Command**

```rust
// main.rs 添加
#[tauri::command]
async fn sync_pull_all(state: tauri::State<'_, Arc<sync::SyncState>>) -> Result<String, String> {
    let token = state.token.read().await.clone()
        .ok_or("Not logged in")?;

    let count = sync::pull::pull_all_threads(
        &state.db_path, &state.sync_url, &token
    ).await.map_err(|e| e.to_string())?;

    Ok(format!("Pulled {} checkpoints", count))
}
```

前端在用户登录后调用 `invoke("sync_pull_all")` 触发首次同步。

**Step 3: Commit**

```bash
git add desktop/src-tauri/src/sync/
git commit -m "feat(sync): implement pull flow for new device onboarding"
```

---

### Task 5.3: 前端 Sync UI

**Files:**
- Create: `frontend/src/components/sync-status.tsx`
- Modify: `frontend/src/app/workspace/layout.tsx` — 添加 sync 状态指示器

**Step 1: Sync 状态组件**

在 workspace 底部或侧边栏显示同步状态：

```typescript
// frontend/src/components/sync-status.tsx
"use client";

import { useEffect, useState } from "react";

type SyncStatus = "synced" | "syncing" | "offline" | "error";

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus>("synced");

  useEffect(() => {
    // 监听 Tauri 事件（如果在 Tauri 环境中）
    if ("__TAURI__" in window) {
      const { listen } = window.__TAURI__.event;
      const unlisten = listen("sync-status", (event: any) => {
        setStatus(event.payload as SyncStatus);
      });
      return () => { unlisten.then(fn => fn()); };
    }
  }, []);

  // Web 环境不显示
  if (typeof window === "undefined" || !("__TAURI__" in window)) {
    return null;
  }

  const labels: Record<SyncStatus, { text: string; color: string }> = {
    synced: { text: "已同步", color: "text-green-500" },
    syncing: { text: "同步中...", color: "text-blue-500" },
    offline: { text: "离线", color: "text-yellow-500" },
    error: { text: "同步失败", color: "text-red-500" },
  };

  const { text, color } = labels[status];

  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {text}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/sync-status.tsx
git commit -m "feat(sync): add sync status indicator component"
```

---

### Task 5.4: 离线队列

**Context:**
用户在没有网络时照常使用，所有操作记录在本地。
网络恢复后，Sync Engine 自动检测并补推。

**Files:**
- Modify: `desktop/src-tauri/src/sync/mod.rs`

**Step 1: 网络检测 + 自动重试**

```rust
// sync/mod.rs — sync_all_threads 中添加网络检测
async fn is_online(sync_url: &str) -> bool {
    reqwest::Client::new()
        .get(format!("{}/health", sync_url))
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .is_ok()
}

// 在 start_sync_loop 中：
if !is_online(&state.sync_url).await {
    // 发送 offline 事件给前端
    // app_handle.emit("sync-status", "offline");
    continue;
}
```

不需要额外的离线队列数据结构 —— 因为本地 SQLite checkpointer 本身就是"队列"。
只要记录每个 thread 上次成功同步的 `checkpoint_id`，下次上线时从那个点继续推就行。

**Step 2: 同步水位线持久化**

```rust
// 在本地 SQLite 中加一张表记录同步进度
conn.execute(
    "CREATE TABLE IF NOT EXISTS sync_watermarks (
        thread_id TEXT PRIMARY KEY,
        last_synced_checkpoint_id TEXT,
        last_synced_at TEXT
    )", []
)?;
```

**Step 3: Commit**

```bash
git add desktop/src-tauri/src/sync/
git commit -m "feat(sync): add offline detection and sync watermarks"
```

---

## Phase 6: Artifact 同步（按需）

> 目标：用户切换设备后，能查看之前生成的 artifacts（报告、代码、图表等）。
> 不全量同步，只在用户打开某个 thread 时按需拉取。
> 预估工期：1 周

### Task 6.1: Artifact 上传到 S3

**Files:**
- Create: `sync-service/app/routers/artifacts.py`
- Modify: `desktop/src-tauri/src/sync/mod.rs` — 添加 artifact push

**Context:**
Artifacts 是文件（HTML、Markdown、图片等），存在 `{base_dir}/threads/{thread_id}/user-data/outputs/` 下。
用 content-hash (SHA256) 做 S3 key，天然去重。

**Step 1: Sync Service — Artifact 上传/下载 API**

```python
# sync-service/app/routers/artifacts.py
import hashlib
import boto3
from fastapi import APIRouter, UploadFile, File, Depends

router = APIRouter(prefix="/sync/artifacts", tags=["sync"])

s3 = boto3.client("s3")
BUCKET = os.getenv("S3_BUCKET", "deerflow-artifacts")

@router.post("/upload")
async def upload_artifact(
    thread_id: str,
    path: str,           # 虚拟路径，如 "/mnt/user-data/outputs/report.html"
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    content_hash = hashlib.sha256(content).hexdigest()
    s3_key = f"{user_id}/{content_hash}"

    # 上传到 S3（如果不存在）
    try:
        s3.head_object(Bucket=BUCKET, Key=s3_key)
    except s3.exceptions.ClientError:
        s3.put_object(Bucket=BUCKET, Key=s3_key, Body=content,
                      ContentType=file.content_type or "application/octet-stream")

    # 记录映射关系
    await db.execute(
        insert(ArtifactMapping).values(
            user_id=user_id,
            thread_id=thread_id,
            virtual_path=path,
            s3_key=s3_key,
            content_hash=content_hash,
            size=len(content),
        ).on_conflict_do_nothing()
    )
    await db.commit()

    return {"s3_key": s3_key, "content_hash": content_hash}

@router.get("/download/{thread_id}")
async def download_artifact(
    thread_id: str,
    path: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ArtifactMapping).where(
            ArtifactMapping.user_id == user_id,
            ArtifactMapping.thread_id == thread_id,
            ArtifactMapping.virtual_path == path,
        )
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(404, "Artifact not found")

    obj = s3.get_object(Bucket=BUCKET, Key=mapping.s3_key)
    return StreamingResponse(obj["Body"], media_type=obj["ContentType"])

@router.get("/list/{thread_id}")
async def list_artifacts(
    thread_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出某个 thread 的所有 artifacts（用于新设备按需拉取）"""
    result = await db.execute(
        select(ArtifactMapping).where(
            ArtifactMapping.user_id == user_id,
            ArtifactMapping.thread_id == thread_id,
        )
    )
    return {"artifacts": [
        {"path": m.virtual_path, "size": m.size, "hash": m.content_hash}
        for m in result.scalars()
    ]}
```

**Step 2: DB Model**

```python
# sync-service/app/models.py 追加
class ArtifactMapping(Base):
    __tablename__ = "artifact_mappings"
    user_id = Column(String(64), nullable=False)
    thread_id = Column(String(64), nullable=False)
    virtual_path = Column(Text, nullable=False)
    s3_key = Column(String(255), nullable=False)
    content_hash = Column(String(64), nullable=False)
    size = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("pk_artifact_mappings",
              "user_id", "thread_id", "virtual_path",
              unique=True),
    )
```

**Step 3: Rust 侧 — Agent 执行完后自动上传 artifacts**

在 Sync Engine 的同步循环中，检查 thread state 的 `artifacts` 列表，
对比本地文件和已上传记录，增量上传新文件。

```rust
// desktop/src-tauri/src/sync/artifact_sync.rs
use reqwest::multipart;
use std::path::Path;

pub async fn sync_artifacts(
    thread_id: &str,
    artifacts_dir: &str,  // {base_dir}/threads/{thread_id}/user-data/outputs/
    sync_url: &str,
    token: &str,
) -> Result<usize, Box<dyn std::error::Error>> {
    let dir = Path::new(artifacts_dir);
    if !dir.exists() {
        return Ok(0);
    }

    let client = reqwest::Client::new();
    let mut count = 0;

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() { continue; }

        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        let virtual_path = format!("/mnt/user-data/outputs/{}", filename);

        let bytes = std::fs::read(&path)?;
        let form = multipart::Form::new()
            .text("thread_id", thread_id.to_string())
            .text("path", virtual_path)
            .part("file", multipart::Part::bytes(bytes).file_name(filename));

        client.post(format!("{}/sync/artifacts/upload", sync_url))
            .bearer_auth(token)
            .multipart(form)
            .send().await?
            .error_for_status()?;

        count += 1;
    }

    Ok(count)
}
```

**Step 4: Commit**

```bash
git add sync-service/app/routers/artifacts.py desktop/src-tauri/src/sync/artifact_sync.rs
git commit -m "feat(sync): add artifact sync via S3 with content-hash dedup"
```

---

## Phase 7: 登录 & 设备管理

> 目标：桌面端用户登录后获取 JWT，Sync Engine 用 JWT 与云端通信。支持多设备管理。
> 预估工期：1 周

### Task 7.1: 桌面端登录流程

**Context:**
桌面端不走 Better Auth 的 cookie-based session（那是给 Web 用的）。
桌面端用 email + password 登录，Sync Service 返回 JWT，Tauri 侧持久化存储。

**Files:**
- Create: `sync-service/app/routers/auth.py`
- Create: `frontend/src/components/desktop-login.tsx`
- Modify: `desktop/src-tauri/src/main.rs` — 添加 token 持久化

**Step 1: Sync Service Auth Endpoints**

```python
# sync-service/app/routers/auth.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import bcrypt
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str
    device_name: str = "Unknown Device"

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email already registered")

    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        password_hash=bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode(),
    )
    db.add(user)
    await db.commit()
    return {"user_id": user.id}

@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not bcrypt.checkpw(req.password.encode(), user.password_hash.encode()):
        raise HTTPException(401, "Invalid credentials")

    # 注册设备
    device = Device(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=req.device_name,
    )
    db.add(device)
    await db.commit()

    token = create_token(user.id)
    return {
        "token": token,
        "user_id": user.id,
        "device_id": device.id,
    }
```

**Step 2: Tauri 侧 Token 持久化**

用 Tauri 的 `tauri-plugin-store` 安全存储 JWT：

```rust
// main.rs — 添加 Tauri command
#[tauri::command]
async fn sync_login(
    email: String,
    password: String,
    state: tauri::State<'_, Arc<sync::SyncState>>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/auth/login", state.sync_url))
        .json(&serde_json::json!({
            "email": email,
            "password": password,
            "device_name": hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "Unknown".to_string()),
        }))
        .send().await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>().await
        .map_err(|e| e.to_string())?;

    if let Some(token) = resp["token"].as_str() {
        // 存储 token
        *state.token.write().await = Some(token.to_string());
        *state.enabled.write().await = true;

        // 持久化到 Tauri store
        let store = app.store("sync-auth.json").map_err(|e| e.to_string())?;
        store.set("token", serde_json::json!(token));
        store.set("user_id", resp["user_id"].clone());
        store.save().map_err(|e| e.to_string())?;

        // 触发首次全量拉取
        let state_clone = state.inner().clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = sync::pull::pull_all_threads(
                &state_clone.db_path, &state_clone.sync_url, token
            ).await {
                eprintln!("[sync] initial pull failed: {}", e);
            }
        });
    }

    Ok(resp)
}

#[tauri::command]
async fn sync_logout(
    state: tauri::State<'_, Arc<sync::SyncState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    *state.token.write().await = None;
    *state.enabled.write().await = false;

    let store = app.store("sync-auth.json").map_err(|e| e.to_string())?;
    store.clear();
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}
```

**Step 3: App 启动时恢复 token**

```rust
// main.rs — setup 中添加
if let Ok(store) = app.store("sync-auth.json") {
    if let Some(token) = store.get("token").and_then(|v| v.as_str().map(String::from)) {
        *sync_state.token.blocking_write() = Some(token);
        *sync_state.enabled.blocking_write() = true;
    }
}
```

**Step 4: 前端登录 UI**

```typescript
// frontend/src/components/desktop-login.tsx
"use client";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function DesktopSyncLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  if (typeof window === "undefined" || !("__TAURI__" in window)) {
    return null; // Web 环境不显示
  }

  const handleLogin = async () => {
    setStatus("loading");
    try {
      await invoke("sync_login", { email, password });
      setStatus("success");
    } catch (e) {
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-medium">云端同步</h3>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border px-3 py-1.5 text-sm"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border px-3 py-1.5 text-sm"
      />
      <button
        onClick={handleLogin}
        disabled={status === "loading"}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
      >
        {status === "loading" ? "登录中..." : "登录并同步"}
      </button>
      {status === "success" && <p className="text-xs text-green-600">已连接，正在同步...</p>}
      {status === "error" && <p className="text-xs text-red-600">登录失败，请检查账号密码</p>}
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add sync-service/app/routers/auth.py frontend/src/components/desktop-login.tsx desktop/src-tauri/
git commit -m "feat(auth): add desktop login flow with JWT + device registration"
```

---

## 总览：时间线 & 风险评估

### 时间线

| Phase | 内容 | 预估工期 | 依赖 |
|-------|------|----------|------|
| 0 | 项目结构调整 | 1 天 | 无 |
| 1 | Tauri Shell + Python Sidecar | 1.5 ~ 2 周 | Phase 0 |
| 2 | Memory Storage 抽象层 | 1 周 | 无（可与 Phase 1 并行） |
| 3 | Thread 用户归属 + Auth 穿透 | 1 周 | Phase 2 |
| 4 | Cloud Sync Service | 2 ~ 3 周 | Phase 3 |
| 5 | Client-side Sync Engine | 2 ~ 3 周 | Phase 1 + Phase 4 |
| 6 | Artifact 同步 | 1 周 | Phase 4 |
| 7 | 登录 & 设备管理 | 1 周 | Phase 4 |

**关键路径：** Phase 0 → Phase 1 → Phase 5（桌面端可用）
**并行路径：** Phase 2 → Phase 3 → Phase 4（后端改造，可与 Phase 1 并行推进）

**总计：8 ~ 12 周**（1 人全职），如果 Phase 1 和 Phase 2-4 并行推进可压缩到 6 ~ 8 周。

### 里程碑

```
Week 1-2:  ✅ Phase 1 完成 — 桌面端能跑起来（纯本地，无同步）
Week 2-3:  ✅ Phase 2+3 完成 — Memory 抽象 + Thread 用户隔离
Week 4-6:  ✅ Phase 4 完成 — Sync Service 上线
Week 6-8:  ✅ Phase 5+6+7 完成 — 端到端同步可用
Week 8+:   优化、测试、发布
```

### 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| **Python 打包失败** — LangChain/LangGraph 有大量动态导入，PyInstaller 可能漏掉 | 高 | 阻塞 Phase 1 | 尽早验证（Task 1.2）。备选方案：不打包 Python，要求用户安装 Python + uv，Tauri 启动时自动 `uv sync && uv run` |
| **Next.js Static Export 不兼容** — 如果前端用了 Server Components / Server Actions | 中 | 阻塞 Phase 1 | 审计前端代码，把 server-only 逻辑移到 API routes。备选：不做 static export，Tauri 内嵌 Node.js 跑 Next.js |
| **Checkpoint 序列化兼容性** — 本地和云端的 LangGraph 版本不一致导致 checkpoint 反序列化失败 | 中 | 影响 Phase 5 | 同步时只传原始 blob，不做反序列化。版本号写入 sync metadata，拉取时校验 |
| **Memory 合并冲突** — 两台设备同时更新 memory 的同一个 section | 低 | 数据丢失 | 字段级合并 + updatedAt 时间戳。极端情况下 last-write-wins，可接受 |
| **跨平台兼容性** — Windows 上 Docker sandbox 行为不同 | 中 | 影响用户体验 | Phase 1 先只支持 macOS，Windows/Linux 后续跟进。Sandbox 可降级为本地进程模式 |
| **Sidecar 进程管理** — 用户强杀 app 导致 Python 进程残留 | 中 | 用户体验差 | Tauri `on_window_event(Destroyed)` + 定时心跳检测。Python 侧加 parent PID 监控，父进程退出自动退出 |

### 备选方案：不打包 Python

如果 PyInstaller 打包 LangChain 生态太坑（这是最大的风险），可以改为：

```
Tauri App
  └── 启动时检测 Python 环境
      ├── 已安装 → uv sync && uv run serve
      └── 未安装 → 引导用户安装 Python 3.12 + uv
                    (提供一键安装脚本)
```

这样 Tauri 不需要打包 Python，只需要管理进程生命周期。
包体从 ~300MB 降到 ~20MB，但用户需要额外安装 Python。
类似于 VS Code 的 Python 扩展 —— 不自带 Python，但帮你管理环境。

---

## 新增文件清单

```
desktop/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/
│   └── src/
│       ├── main.rs
│       └── sync/
│           ├── mod.rs
│           ├── checkpoint_sync.rs
│           ├── memory_sync.rs
│           ├── artifact_sync.rs
│           ├── pull.rs
│           └── queue.rs

sync-service/
├── pyproject.toml
├── Dockerfile
├── docker-compose.yaml
└── app/
    ├── main.py
    ├── models.py
    ├── auth.py
    ├── database.py
    └── routers/
        ├── checkpoints.py
        ├── memory.py
        ├── settings.py
        ├── artifacts.py
        └── auth.py

frontend/
├── src/
│   ├── lib/api-config.ts              (新增)
│   └── components/
│       ├── sync-status.tsx            (新增)
│       └── desktop-login.tsx          (新增)
├── scripts/build-desktop.sh           (新增)

backend/
├── packages/harness/deerflow/agents/memory/
│   └── store.py                       (新增)
├── deerflow-desktop.spec              (新增)
└── scripts/build-sidecar.sh           (新增)
```

## 改动文件清单

```
backend/
├── packages/harness/deerflow/agents/memory/updater.py     — MemoryStore 迁移
├── packages/harness/deerflow/agents/memory/queue.py       — 添加 user_id 参数
├── packages/harness/deerflow/agents/middlewares/
│   ├── memory_middleware.py                                — 从 context 读 user_id
│   └── thread_data_middleware.py                           — 按 user 隔离 workspace
├── app/gateway/main.py                                     — CORS + MemoryStore 初始化
├── app/gateway/routers/memory.py                           — 传递 user_id
└── app/gateway/services/config_renderer.py                 — 支持 postgres checkpointer

frontend/
├── next.config.ts                                          — static export 模式
├── src/core/threads/hooks.ts                               — user_id 注入 + metadata 过滤
└── src/core/threads/types.ts                               — AgentThreadContext 扩展
```
