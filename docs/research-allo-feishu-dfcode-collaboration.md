# Allo + 飞书 + dfcode 群组协作调研报告

> 调研日期：2026-03-26
> 目标：实现从飞书控制 Allo，让 Allo 控制 dfcode 及其他产品，三方在飞书群组内互相协作

---

## 一、现状梳理

### 1.1 系统拓扑

```
┌─────────────────────────────────────────────────────────────────────┐
│                          飞书群组                                    │
│   用户、Allo Bot、dfcode Bot、其他产品 Bot                            │
└──────────┬──────────────────────────────┬───────────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐      ┌──────────────────────────┐
│  Allo (deer-flow)   │      │  dfcode                  │
│                     │      │                          │
│  Gateway :8001      │      │  Hono Server :4096       │
│  LangGraph :2024    │      │  REST + SSE              │
│  Frontend :3000     │      │                          │
│  Nginx :2026        │      │  packages/remote         │
│                     │      │  (Python Feishu bridge)  │
│  channels/feishu.py │      │                          │
│  (内置飞书通道)      │      │  dfcode_remote/          │
│                     │      │  (独立飞书 bridge)        │
└─────────────────────┘      └──────────────────────────┘
```

### 1.2 Allo 飞书通道

**核心文件：**
- `backend/app/channels/feishu.py` — FeishuChannel 实现 (511行)
- `backend/app/channels/base.py` — Channel 抽象基类 (109行)
- `backend/app/channels/message_bus.py` — MessageBus 异步 pub/sub (174行)
- `backend/app/channels/manager.py` — ChannelManager 消息调度 (704行)
- `backend/app/channels/store.py` — ChannelStore chat→thread 映射 (154行)
- `backend/app/channels/service.py` — ChannelService 生命周期管理 (179行)

**消息流：**
1. 飞书 WebSocket SDK 接收 `im.message.receive_v1` 事件
2. `FeishuChannel._on_message()` 解析消息，构造 `InboundMessage`
3. 添加 "OK" emoji 反应 + 创建 "Working on it..." 卡片
4. `MessageBus.publish_inbound()` 入队
5. `ChannelManager._dispatch_loop()` 消费
6. 查找/创建 LangGraph thread (`ChannelStore` 映射)
7. 飞书通道走 `runs.stream()` 流式处理（其他通道走 `runs.wait()`）
8. 流式更新：每 0.35s 发布 `OutboundMessage` → patch 飞书卡片
9. 最终回复 + "DONE" emoji 反应

**特性：**
- WebSocket 长连接，无需公网 IP
- 流式卡片更新（直接 patch message）
- 话题线程映射：`root_id` → 同一 Allo thread
- 文件上传支持（图片 10MB / 文件 30MB）
- 命令：`/new`, `/status`, `/models`, `/memory`, `/help`
- 每通道、每用户的 session 配置覆盖

**配置：**
```yaml
# config.yaml
channels:
  langgraph_url: http://localhost:2024
  gateway_url: http://localhost:8001
  session:
    assistant_id: lead_agent
    config: { recursion_limit: 100 }
    context: { thinking_enabled: true, is_plan_mode: false, subagent_enabled: false }
  feishu:
    enabled: false
    app_id: $FEISHU_APP_ID
    app_secret: $FEISHU_APP_SECRET
```

**通道注册机制 (`service.py:15`)：**
```python
_CHANNEL_REGISTRY: dict[str, str] = {
    "feishu": "app.channels.feishu:FeishuChannel",
    "slack": "app.channels.slack:SlackChannel",
    "telegram": "app.channels.telegram:TelegramChannel",
}
```

### 1.3 Allo Gateway API 端点

| 路由 | 方法 | 用途 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/models` | GET | 列出所有配置的模型 |
| `/api/mcp/config` | GET/PUT | MCP 服务器配置读写 |
| `/api/skills` | GET | 列出所有技能 |
| `/api/skills/{name}` | GET/PUT | 技能详情/启用状态 |
| `/api/skills/install` | POST | 安装 .skill 归档 |
| `/api/memory` | GET | 获取记忆数据 |
| `/api/memory/reload` | POST | 强制重载记忆 |
| `/api/threads/{id}/uploads` | POST/GET/DELETE | 文件上传管理 |
| `/api/threads/{id}/artifacts/{path}` | GET | 获取 agent 生成的文件 |
| `/api/threads/{id}/suggestions` | POST | 生成后续问题建议 |
| `/api/agents` | GET/POST | 自定义 agent CRUD |
| `/api/agents/{name}` | GET/PUT/DELETE | 单个 agent 管理 |
| `/api/user-profile` | GET/PUT | USER.md 内容 |
| `/api/channels/` | GET | IM 通道状态 |
| `/api/channels/{name}/restart` | POST | 重启指定通道 |
| `/api/config` | GET/PUT | 租户配置 |
| `/api/config/import` | POST | 导入 YAML/JSON 配置 |
| `/api/config/export` | GET | 导出配置 |
| `/api/knowledge-bases` | GET/POST | 知识库 CRUD |
| `/api/knowledge-bases/{id}/documents` | POST | 上传文档到知识库 |
| `/api/knowledge-bases/{id}/search` | POST | 语义搜索 |
| `/api/admin/organizations` | GET | 组织管理 (平台管理员) |
| `/api/marketplace/tools` | GET | 工具市场 |
| `/api/marketplace/skills` | GET | 技能市场 |

### 1.4 Allo Agent 执行流

```
用户消息
    │
    ▼
make_lead_agent(config)  ← backend/packages/harness/deerflow/agents/lead_agent/agent.py:267
    ├── _resolve_model_name() → 选择 LLM
    ├── create_chat_model(name, thinking_enabled)
    ├── get_available_tools(groups, include_mcp, model_name, subagent_enabled)
    │   ├── Config tools (web_search, web_fetch, image_search, ls, read_file, write_file, str_replace, bash)
    │   ├── Built-in tools (present_files, ask_clarification, view_image)
    │   ├── MCP tools (from extensions_config.json, 懒加载 + mtime 缓存)
    │   └── Subagent tool (task) — if subagent_enabled
    ├── _build_middlewares(config)
    │   ├── ToolErrorHandlingMiddleware
    │   ├── SummarizationMiddleware (if enabled)
    │   ├── TodoMiddleware (if plan_mode)
    │   ├── TitleMiddleware → MemoryMiddleware → ViewImageMiddleware
    │   ├── SubagentLimitMiddleware (max 3)
    │   ├── ResearchBudgetMiddleware → LoopDetectionMiddleware
    │   └── ClarificationMiddleware (always last)
    └── apply_prompt_template() → 系统提示词 (skills, memory, subagent)
    │
    ▼
Agent Loop (LangGraph):
    1. Middleware before_model hooks
    2. LLM 生成响应 (含 tool calls)
    3. Middleware after_model hooks
    4. 有 tool calls → 执行 → 回到 1
    5. 无 tool calls → 最终响应
    │
    ▼
SSE Stream Events:
    - "values" → 完整状态快照 {title, messages, artifacts, todos}
    - "messages-tuple" → 逐消息更新 (AI text chunks, tool calls, tool results)
    - "custom" → subagent task_running 事件
    - "end" → 流结束
```

**ThreadState 模型 (`thread_state.py:48`)：**
```python
class ThreadState(AgentState):
    sandbox: SandboxState | None          # {sandbox_id}
    thread_data: ThreadDataState | None   # {workspace_path, uploads_path, outputs_path}
    title: str | None                     # 自动生成的标题
    artifacts: list[str]                  # 去重的文件路径
    todos: list | None                    # 计划模式任务列表
    uploaded_files: list[dict] | None     # 用户上传的文件
    viewed_images: dict[str, ViewedImageData]  # 图片缓存
```

### 1.5 dfcode 主体架构

**项目结构 (`/Users/wbz/dfcode/dfcode/`)：**

| 包 | 路径 | 用途 |
|---|---|---|
| `packages/dfcode` | 核心包 | CLI/TUI/HTTP Server, session 引擎, 25+ tools, agents, providers |
| `packages/sdk/js` | `@dfcode/sdk` | 从 OpenAPI spec 自动生成的 TypeScript SDK (v1/v2) |
| `packages/remote` | `dfcode-remote` | Python 飞书 bridge — WebSocket bot + SSE listener → 卡片更新 |
| `packages/plugin` | `@dfcode/plugin` | 插件系统类型和 Hooks 接口 |
| `packages/util` | `@dfcode/util` | 共享工具 (error types, slugs 等) |
| `packages/vscode` | `dfcode-vscode` | VS Code 扩展 — webview chat panel |

**核心架构：**

```
┌─────────────────────────────────────────────────────────────────┐
│                        dfcode serve :4096                        │
│                     (Hono HTTP + SSE + WS)                       │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Session  │ │ Provider │ │  Tool    │ │  Agent   │           │
│  │ Manager  │ │ (AI SDK) │ │ Registry │ │ System   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Permission│ │  Plugin  │ │   MCP    │ │   Bus    │           │
│  │  System  │ │  System  │ │  Client  │ │ (Events) │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲              ▲
         │              │              │              │
    ┌────┴────┐   ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
    │   TUI   │   │  CLI    │   │  VS Code│   │ Remote  │
    │(SolidJS)│   │  `run`  │   │Extension│   │ Bridge  │
    └─────────┘   └─────────┘   └─────────┘   └─────────┘
                                                    │
                                              ┌─────┴─────┐
                                              │  Feishu   │
                                              │  (Lark)   │
                                              └───────────┘
```

**dfcode REST API（外部控制的关键端点）：**

| 端点 | 方法 | 用途 |
|------|------|------|
| `/session` | POST | 创建 session |
| `/session` | GET | 列出 sessions |
| `/session/active` | GET | 列出跨项目活跃 sessions |
| `/session/active/:id` | GET | 获取活跃 session 详情 |
| `/session/:id` | DELETE | 删除 session |
| `/session/:id/abort` | POST | 中止运行中的 session |
| `/session/:id/message` | POST | 发送消息（同步，流式响应） |
| `/session/:id/prompt_async` | POST | 异步发送消息（立即返回 204） |
| `/session/active/:id/prompt_async` | POST | 跨项目异步 prompt |
| `/session/:id/command` | POST | 执行斜杠命令 |
| `/session/:id/shell` | POST | 在 session 上下文中运行 shell |
| `/permission` | GET | 列出待处理的权限请求 |
| `/permission/:id/reply` | POST | 回复权限（once/always/reject） |
| `/question` | GET | 列出待处理的问题 |
| `/question/:id/reply` | POST | 回答问题 |
| `/event` | GET (SSE) | 实例级 SSE 事件流 |
| `/global/event` | GET (SSE) | 全局 SSE 事件流（跨项目） |

**Session 生命周期：**
1. `POST /session` → 创建，返回 `Session.Info` (id, slug, projectID, directory)
2. `POST /session/:id/prompt_async` → 发送 prompt，后台执行 agent loop
3. Agent loop: LLM call → tool execution → repeat until done
4. 状态变化通过 `Bus.publish()` → SSE stream 推送
5. `session.idle` 事件表示处理完成

**Prompt 输入格式：**
```typescript
{
  sessionID: string,
  parts: [
    { type: "text", text: "..." },
    { type: "file", url: "file:///path", filename: "...", mime: "text/plain" },
    { type: "agent", name: "explore" },
    { type: "subtask", prompt: "...", agent: "general" }
  ],
  model?: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
  agent?: "build",
  system?: "...",
  variant?: "high",
}
```

**Bus 事件类型：**

| 事件 | 说明 |
|------|------|
| `session.status` | Session 状态变化 (idle/busy/retry) |
| `session.idle` | Session 处理完成 |
| `session.created/updated/deleted` | Session 生命周期 |
| `session.error` | 错误发生 |
| `message.part.updated` | 实时 part 更新 (text chunks, tool calls, reasoning) |
| `permission.asked` | 权限请求需要用户响应 |
| `permission.replied` | 权限已回答 |
| `question.asked` | 问题需要用户响应 |
| `worker.heartbeat` | Subagent/worker 进度 |

### 1.6 dfcode remote bridge

**核心文件 (`/Users/wbz/dfcode/dfcode/packages/remote/`)：**

| 文件 | 行数 | 说明 |
|------|------|------|
| `dfcode_remote/cli.py` | 107 | 入口：解析参数，组装组件，`asyncio.gather(sse_task, bot_task)` |
| `dfcode_remote/lark_client/bot.py` | 73 | 飞书 WebSocket 启动，SDK 线程 → asyncio 主循环桥接 |
| `dfcode_remote/lark_client/handler.py` | 466 | 命令路由 + 卡片交互回调 |
| `dfcode_remote/lark_client/event_listener.py` | 426 | SSE → 飞书卡片桥接，per-chat 状态机，防抖更新 |
| `dfcode_remote/lark_client/card_builder.py` | 484 | 飞书 Card Schema 2.0 JSON 构建器 |
| `dfcode_remote/lark_client/card_service.py` | 256 | 飞书 API 封装：token 管理, CardKit CRUD, IM 消息 |
| `dfcode_remote/dfcode_client/client.py` | 196 | `DfcodeClient` — async httpx 封装 dfcode REST API |
| `dfcode_remote/dfcode_client/sse.py` | 105 | SSE 流消费者，自动重连 + 指数退避 + 心跳超时 |
| `dfcode_remote/dfcode_client/types.py` | 213 | 数据类：SessionInfo, PartInfo, PermissionRequest 等 |
| `dfcode_remote/utils/config.py` | 66 | 配置加载 (.env + 环境变量) |
| `dfcode_remote/utils/persistence.py` | 57 | JSON 文件持久化 chat↔session 绑定 |
| `dfcode_remote/utils/markdown.py` | 53 | Markdown → 飞书卡片转换 |

**消息流：飞书 → bridge → dfcode → 飞书**

```
入站 (用户发消息):
  飞书 WS SDK → bot.py (run_coroutine_threadsafe) → handler.py:handle_message()
    → 去重检查 (5分钟窗口, message_id)
    → 授权检查 (ALLOWED_USERS)
    → 命令路由 (/new, /list, /attach, /detach, /status, /kill, /menu)
    → 或 prompt 路由:
        → 查找 chat_id → session_id 绑定
        → 检查 session 状态 (拒绝 busy)
        → POST /session/{id}/prompt_async (带 x-dfcode-directory header)
        → 注册 pending_replies[session_id] = {chat_id, last_id}

出站 (dfcode 事件 → 飞书):
  event_listener.py:run() 消费 GET /global/event SSE 流
    → permission.asked → 创建交互卡片 (允许/始终允许/拒绝 按钮)
    → question.asked → 创建问题卡片 (选项按钮或多选表单)
    → session.idle → 获取最新 assistant 消息 → 发送文本回复到飞书

卡片交互 (用户点击按钮):
  飞书 card.action.trigger → handler.py:handle_card_action()
    → permission → POST /permission/{id}/reply
    → question → POST /question/{id}/reply
    → abort → POST /session/{id}/abort
    → 冻结交互卡片为 "已处理" 状态
```

**配置：**
```
FEISHU_APP_ID        — 飞书 app ID (必需)
FEISHU_APP_SECRET    — 飞书 app secret (必需)
DFCODE_URL           — dfcode 服务器 URL (默认: http://localhost:4096)
DFCODE_DIRECTORY     — 默认工作目录 (默认: .)
DFCODE_USERNAME      — Basic auth 用户名 (可选)
DFCODE_PASSWORD      — Basic auth 密码 (可选)
ALLOWED_USERS        — 逗号分隔的飞书 user ID 白名单 (空=允许所有)
ENABLE_URGENT        — 完成时发送加急通知 (默认: true)
```

**关键设计模式：**
- 线程→异步桥接：`lark_oapi` SDK 在自己的线程运行，通过 `run_coroutine_threadsafe()` 派发到主 asyncio 循环
- 防抖卡片更新：0.5s 防抖窗口，合并快速 SSE 事件为单次 `update_card` 调用
- 卡片分割：接近 50 block 限制时冻结当前卡片，创建新卡片
- CardKit 降级：CardKit API 不可用时进入 `direct_mode`，只在完成时发送最终卡片

### 1.7 飞书开放平台 SDK 规范

**认证流程：**
```
POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
{ "app_id": "cli_xxx", "app_secret": "xxx" }
→ { "tenant_access_token": "t-xxx", "expire": 7200 }
```
- `tenant_access_token` 有效期 2 小时，SDK 自动刷新
- 所有 API 调用使用 `Authorization: Bearer t-xxx`

**事件订阅 — 两种模式：**

| 模式 | 特点 | 适用场景 |
|------|------|----------|
| WebSocket 长连接 | 无需公网 IP，内置加密，最多 50 连接/应用 | 自建应用（推荐） |
| Webhook HTTP 回调 | 需要公网 URL，需手动验签/解密 | 需要公网暴露的场景 |

**关键事件：**
- `im.message.receive_v1` — 接收消息（群聊/私聊）
- `card.action.trigger` — 卡片按钮/表单交互回调

**消息发送 API：**
```
POST /open-apis/im/v1/messages?receive_id_type=chat_id    # 发送消息
POST /open-apis/im/v1/messages/{message_id}/reply          # 回复消息
PUT  /open-apis/im/v1/messages/{message_id}                # 编辑消息 (text/post, 最多20次)
PATCH /open-apis/im/v1/messages/{message_id}               # 更新卡片
```

**群聊管理 API：**
```
POST /open-apis/im/v1/chats                                # 创建群
POST /open-apis/im/v1/chats/{chat_id}/members              # 添加成员
GET  /open-apis/im/v1/chats/{chat_id}                      # 获取群信息
```

**@Bot 处理：**
- `im:message.group_at_msg:readonly` — 只接收 @bot 的消息
- `im:message.group_msg:readonly` — 接收群内所有消息（敏感权限，需审批）
- 消息内容中 `@_user_1` 占位符 + `mentions` 数组标识被 @ 的用户

**卡片 (Card Schema 2.0)：**
```json
{
    "schema": "2.0",
    "config": { "update_multi": true, "streaming_mode": false },
    "header": { "title": {"tag": "plain_text", "content": "标题"}, "template": "blue" },
    "body": {
        "elements": [
            {"tag": "markdown", "content": "**Bold** text\n- bullet"},
            {"tag": "button", "text": {"tag": "plain_text", "content": "Click"},
             "type": "primary", "behaviors": [{"type": "open_url", "default_url": "..."}]}
        ]
    }
}
```

**CardKit API（原地更新卡片）：**
```
POST /open-apis/cardkit/v1/cards                           # 创建卡片 → card_id
PUT  /open-apis/cardkit/v1/cards/{card_id}                 # 更新卡片内容 (带 sequence)
```

**速率限制：**

| API | 限制 |
|-----|------|
| 发送/回复消息 | 5 QPS/用户, 5 QPS/群 |
| 所有消息 API | 1000/min & 50/sec 全局 |
| 群 API | 1000/min & 50/sec 全局 |
| 卡片更新 (PATCH) | 5 QPS/消息 |
| WebSocket 连接 | 最多 50/应用 |

**Python SDK (`lark-oapi`) 基本模式：**
```python
import lark_oapi as lark

# API Client (发送消息)
api_client = lark.Client.builder().app_id(APP_ID).app_secret(APP_SECRET).build()

# Event Handler (接收消息)
def on_message(data: lark.im.v1.P2ImMessageReceiveV1) -> None:
    msg = data.event.message
    chat_id = msg.chat_id
    text = json.loads(msg.content).get("text", "")
    # ... 处理消息

event_handler = lark.EventDispatcherHandler.builder("", "") \
    .register_p2_im_message_receive_v1(on_message).build()

# WebSocket Client
ws_client = lark.ws.Client(APP_ID, APP_SECRET, event_handler=event_handler)
ws_client.start()  # 阻塞
```

### 1.8 两个系统的关键差异对比

| 维度 | Allo 飞书通道 | dfcode remote bridge |
|------|-------------|---------------------|
| 实现语言 | Python (内嵌在 Gateway 进程) | Python (独立进程) |
| 与主服务通信 | 进程内 MessageBus + LangGraph SDK | HTTP REST + SSE |
| 会话管理 | ChannelStore (chat→thread) | Persistence (chat→session) |
| 流式更新 | 直接 patch 卡片 (message.patch) | CardKit API 原地更新 (带 sequence) |
| 交互能力 | 单向（发消息/回复/emoji） | 双向（权限按钮、问题选择、中止按钮） |
| 跨项目 | 无（单 LangGraph 实例） | 有（`/session/active` 跨目录） |
| 命令系统 | `/new`, `/status`, `/models`, `/memory`, `/help` | `/new`, `/list`, `/attach`, `/detach`, `/status`, `/kill`, `/menu` |
| 话题线程 | `root_id` → 同一 Allo thread | 1:1 绑定 chat_id → session_id |

---

## 二、协作架构方案

### 2.1 方案 A：Allo 作为编排器，dfcode 作为 Tool

```
飞书群组 (单 Bot: Allo)
    │
    ▼
Allo Agent ──Custom Tool──→ dfcode serve :4096
                              (REST API 调用)
```

- 用户只和 Allo 对话
- Allo 通过自定义 Tool 调用 dfcode REST API
- dfcode 的权限/问题交互由 Allo agent 代理处理

| 优点 | 缺点 |
|------|------|
| UX 最简单，单一对话入口 | dfcode 交互能力被降级为纯文本 |
| 实现成本低 | Allo agent 需要理解编码上下文 |
| 无需协调多 Bot | dfcode 的权限/问题卡片无法展示 |

### 2.2 方案 B：多 Bot 群组，独立运行

```
飞书群组 (2 Bot: Allo Bot + dfcode Bot)
    │                    │
    ▼                    ▼
Allo (channels/feishu)   dfcode-remote
    │                    │
    ▼                    ▼
LangGraph Server         dfcode serve
```

- 两个独立飞书应用，各自处理 @自己 的消息
- 用户 @Allo 处理办公任务，@dfcode 处理编码任务

| 优点 | 缺点 |
|------|------|
| 最简单的实现，各自独立 | 无法协作 |
| 各自保留完整能力 | Allo 不能调度 dfcode |
| 互不干扰 | dfcode 不能获取 Allo 上下文 |

### 2.3 方案 C（推荐）：混合架构 — Allo 编排 + dfcode 独立 + 协调层

```
┌──────────────────────────────────────────────────────────────┐
│                       飞书群组                                │
│  用户  ←→  @Allo Bot  ←→  @dfcode Bot  ←→  @其他产品 Bot     │
└────┬──────────┬──────────────┬──────────────────┬────────────┘
     │          │              │                  │
     │    ┌─────▼─────┐  ┌────▼────────┐   ┌────▼────────┐
     │    │ Allo      │  │ dfcode      │   │ 其他产品     │
     │    │ Gateway   │  │ remote      │   │ (已接飞书)   │
     │    └─────┬─────┘  └────┬────────┘   └─────────────┘
     │          │              │
     │    ┌─────▼─────┐  ┌────▼────────┐
     │    │ LangGraph │  │ dfcode      │
     │    │ Server    │  │ serve :4096 │
     │    └─────┬─────┘  └────┬────────┘
     │          │              │
     │          └──────┬───────┘
     │           ┌─────▼──────┐
     │           │ 协调层      │
     │           │ (双向 API)  │
     │           └────────────┘
```

| 优点 | 缺点 |
|------|------|
| 各系统保留完整能力 | 实现复杂度最高 |
| Allo 可主动调度 dfcode | 需要协调层 |
| dfcode 可查询 Allo 上下文 | 需要共享状态映射 |
| 用户可见完整协作过程 | 两个 Bot 的消息需要协调 |
| 可扩展到更多产品 | |

---

## 三、方案 C 详细设计

### 3.1 协调层设计

协调层不是一个新服务，而是在 Allo 和 dfcode 两侧各增加对接能力：

```
Allo 侧新增:
├── dfcode Custom Tool         # Allo agent 可调用 dfcode REST API
├── 飞书群消息转发 Hook         # 监听群内 dfcode 的回复，注入 Allo 上下文
└── 跨系统 Thread 映射          # 飞书 chat_id → Allo thread + dfcode session

dfcode 侧新增:
├── Allo API Client            # dfcode 可查询 Allo 的记忆/知识库
├── 群组消息广播                # dfcode 完成任务后通知 Allo
└── 共享上下文接口              # 暴露 session 状态给 Allo
```

### 3.2 飞书群组消息路由规则

```
用户消息到达飞书群
    │
    ├── @Allo → Allo Bot 接收 (im:message.group_at_msg)
    │          → channels/feishu.py 处理
    │          → 如需编码 → 调用 dfcode Tool (直接 REST API)
    │
    ├── @dfcode → dfcode Bot 接收 (im:message.group_at_msg)
    │            → dfcode-remote handler.py 处理
    │            → 如需上下文 → 查询 Allo Gateway API
    │
    ├── @Allo @dfcode → 两个 Bot 都收到
    │                  → 需要协调：Allo 作为主控，dfcode 等待 Allo 指令
    │
    └── 无 @mention → 两个 Bot 都不收到
                     (除非开启 im:message.group_msg:readonly)
```

### 3.3 Allo → dfcode 调用（dfcode Tool 设计）

在 Allo 中新增自定义 Tool，通过 REST API 调用 dfcode：

```python
# backend/packages/harness/deerflow/tools/dfcode_tool.py

import httpx
from langchain.tools import tool

DFCODE_URL = "http://localhost:4096"

@tool
async def dfcode_code_task(task_description: str, project_directory: str = ".") -> str:
    """Delegate a coding task to dfcode agent.

    Use this when the user needs code written, debugged, or modified.
    dfcode is a specialized coding agent with file editing, bash execution,
    and code search capabilities.

    Args:
        task_description: Detailed description of the coding task.
        project_directory: The project directory for dfcode to work in.
    """
    async with httpx.AsyncClient(timeout=300) as client:
        # 1. 创建 session
        resp = await client.post(f"{DFCODE_URL}/session", json={},
                                  headers={"x-dfcode-directory": project_directory})
        session_id = resp.json()["id"]

        # 2. 发送 prompt (异步)
        await client.post(
            f"{DFCODE_URL}/session/{session_id}/prompt_async",
            json={"parts": [{"type": "text", "text": task_description}]},
            headers={"x-dfcode-directory": project_directory},
        )

        # 3. 轮询等待完成
        for _ in range(150):  # 最多等 5 分钟
            await asyncio.sleep(2)
            status_resp = await client.get(f"{DFCODE_URL}/session/status")
            statuses = status_resp.json()
            if statuses.get(session_id) == "idle":
                break

        # 4. 获取结果
        msg_resp = await client.get(f"{DFCODE_URL}/session/{session_id}/message")
        messages = msg_resp.json()

        # 提取最后一条 assistant 消息
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                return _extract_text_from_parts(msg.get("parts", []))

        return "dfcode task completed but no response text found."
```

**注册到 Allo 的 tool 配置：**
```yaml
# config.yaml
tools:
  - name: dfcode
    enabled: true
    tools:
      - dfcode_code_task
```

### 3.4 dfcode → Allo 回调

dfcode 完成任务后通知 Allo（扩展 `event_listener.py`）：

```python
# dfcode_remote/lark_client/event_listener.py 扩展

ALLO_GATEWAY_URL = "http://localhost:8001"

async def _notify_allo_completion(self, session_id: str, result_text: str):
    """Notify Allo that a dfcode task has completed."""
    async with httpx.AsyncClient() as client:
        await client.post(f"{ALLO_GATEWAY_URL}/api/channels/webhook", json={
            "source": "dfcode",
            "event": "task_complete",
            "session_id": session_id,
            "result": result_text[:2000],
        })
```

或者更简单地，通过飞书群消息 @Allo：

```python
async def _notify_via_feishu(self, chat_id: str, result_summary: str):
    """Send a message in the group @mentioning Allo bot."""
    await self.card_service.send_text(
        chat_id,
        f"<at user_id=\"{ALLO_BOT_OPEN_ID}\">Allo</at> 编码任务已完成：{result_summary[:500]}"
    )
```

### 3.5 共享上下文

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Allo Memory │ ←──→│ 共享上下文层  │←──→ │ dfcode      │
│ (facts,     │     │              │     │ Session     │
│  knowledge) │     │ HTTP 互查    │     │ Storage     │
└─────────────┘     └──────────────┘     └─────────────┘
```

- Allo 的记忆 (`GET /api/memory`) 可以被 dfcode 查询
- dfcode 的 session 状态 (`GET /session/active`) 可以被 Allo 查询
- 共享的飞书 `chat_id` 作为关联键

---

## 四、具体改造清单

### 4.1 Allo 侧改造

| 改造项 | 文件 | 工作量 | 优先级 |
|--------|------|--------|--------|
| 新增 dfcode Tool | `deerflow/tools/dfcode_tool.py` (新建) | 中 | P0 |
| Tool 注册到 config | `config.yaml` tools 配置 | 小 | P0 |
| dfcode session 状态查询 | Tool 内部实现 | 小 | P0 |
| 飞书群 @dfcode 发消息能力 | `channels/feishu.py` 扩展 send | 中 | P1 |
| 跨系统 thread 映射 | `channels/store.py` 扩展 | 中 | P1 |
| Allo Gateway webhook 端点 | `gateway/routers/` 新增 | 中 | P2 |

### 4.2 dfcode 侧改造

| 改造项 | 文件 | 工作量 | 优先级 |
|--------|------|--------|--------|
| Allo API 查询能力 | `dfcode_remote/` 新增 allo_client | 中 | P1 |
| 任务完成回调 Allo | `event_listener.py` 扩展 `_on_session_idle` | 小 | P1 |
| 共享 chat_id 映射 | `persistence.py` 扩展 | 小 | P1 |
| 飞书群 @Allo 发消息 | `card_service.py` 扩展 | 小 | P2 |

---

## 五、实施路线

```
Phase 1 (1-2天): Allo → dfcode 单向调用
  ├── 在 Allo 中新增 dfcode_code_task Tool
  ├── 通过 REST API 调用 dfcode serve
  ├── 用户 @Allo "帮我写个xxx" → Allo 判断需要编码 → 调用 dfcode → 返回结果
  └── 验证端到端流程

Phase 2 (1天): 飞书群双 Bot 共存
  ├── 两个飞书应用加入同一群
  ├── 各自处理 @自己 的消息
  ├── 验证互不干扰
  └── 验证 @mention 路由正确

Phase 3 (2-3天): 双向协作
  ├── Allo 完成编码任务后在群里通知
  ├── dfcode 完成后回调通知 Allo
  ├── 共享 chat_id → thread/session 映射
  └── 验证协作流程

Phase 4 (3-5天): 深度集成
  ├── 共享上下文（Allo 记忆 ↔ dfcode session）
  ├── dfcode 权限/问题交互转发给 Allo 处理
  ├── 统一的任务看板（飞书卡片展示两个系统的任务状态）
  └── 扩展到其他已接入飞书的产品
```

---

## 六、关键技术决策点

### 6.1 dfcode 集成方式

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| Custom Tool (直接 HTTP) | 在 Allo 中写一个 LangChain tool，直接调用 dfcode REST API | 推荐（起步） |
| MCP Server | 将 dfcode REST API 包装为 MCP Server，Allo 通过 MCP 协议调用 | 后期（标准化） |
| 飞书群消息 @dfcode | Allo 在群里 @dfcode 发消息，用户可见 | 补充（可见性） |

### 6.2 消息路由策略

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| @mention 路由 | 飞书原生支持，各 Bot 只收 @自己 的消息 | 推荐 |
| 关键词路由 | 需要 `group_msg:readonly` 敏感权限 | 不推荐 |
| 单 Bot + 内部路由 | 一个飞书 Bot 接收所有消息，内部分发 | 备选 |

### 6.3 协作可见性

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| API 直调 | 低延迟但用户不可见 | 推荐（主路径） |
| 飞书群消息 | 用户可见完整协作过程，但有 5 QPS 限制 | 补充（通知） |
| 混合 | API 直调 + 关键节点群消息通知 | 最佳实践 |

### 6.4 状态共享

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| HTTP 互查 | 轻量级，各自暴露 API | 推荐（起步） |
| 共享数据库 | Redis/SQLite 存储跨系统映射 | 后期优化 |
| 消息队列 | RabbitMQ/Redis Streams 事件驱动 | 大规模场景 |

---

## 七、已知风险和注意事项

1. **飞书 QPS 限制**：群内发送消息 5 QPS/群，两个 Bot 共享此限制。高频协作场景需要注意节流。

2. **dfcode 权限系统**：dfcode 的 permission/question 交互是阻塞式的（等待用户回复才继续）。如果 Allo 调用 dfcode，需要处理这些交互——要么自动批准，要么转发给用户。

3. **Session 生命周期**：dfcode session 是有状态的（绑定到项目目录）。Allo 调用 dfcode 时需要管理 session 的创建和清理。

4. **两个 Bot 的飞书应用**：需要两个独立的飞书应用（不同的 app_id/app_secret），各自配置权限和事件订阅。

5. **dfcode remote bridge 的 `message.part.updated` 事件未接入**：`event_listener.py` 的 `_dispatch` 方法目前只处理 `permission.asked`、`question.asked`、`session.idle`、`session.status` 四种事件，流式卡片更新的基础设施存在但未启用。

6. **Allo ChannelStore 使用 JSON 文件**：`store.py:33` 注释标注需要 DB 后端用于生产环境。

7. **Allo API Key 认证未实现**：`auth.py:278-280` 中 `X-API-Key` / `Bearer df-...` 路径存在但返回 401 "not yet supported"。dfcode 调用 Allo API 时需要考虑认证方式。
