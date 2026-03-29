# VaaT-Flow 桌面客户端开发复盘

> 日期: 2025-03-29
> 目标: 将 VaaT-Flow (DeerFlow fork) 打包为桌面客户端 (dmg/exe)，文书人员下载安装登录即可使用
> 结果: **未达成目标**。dmg 可以构建和安装，Tauri 窗口可以打开，Next.js 前端可以渲染，但核心功能（发消息、模型调用）不可用。

---

## 一、当前状态

### 能工作的部分
1. **Sync Service** — Docker 部署正常，API 全部可用（auth/models/sync）
2. **模型配置** — 通过 admin-cli.py 成功配置了 GPT 5.4 和 Claude Opus 4.6
3. **Tauri 壳** — 编译通过，dmg 可以生成（2.3GB），安装后能启动
4. **Next.js 前端** — standalone 模式构建成功，在 Tauri 内可以渲染页面
5. **资源打包** — frontend/node/python/venv/backend 全部打包进 .app

### 不能工作的部分
1. **发消息无反应** — Python 后端（Gateway + LangGraph）没有启动
2. **模型未加载** — 本地没有 config.yaml，因为登录流程未完成
3. **MCP/技能报错** — Gateway 没启动，所有后端 API 返回 404
4. **登录流程断裂** — 登录依赖 Tauri invoke，但 Tauri WebView 指向 localhost:3000，__TAURI__ API 未注入

---

## 二、根本问题分析

### 问题 1: 架构方案选择失误 — static export vs standalone

**决策过程:**
- 最初选择 `output: 'export'`（纯静态导出），Tauri WebView 直接加载本地 HTML
- 遇到 Next.js App Router 的动态路由 `[thread_id]`、`[id]` 等无法 static export
- 尝试用 wrapper 脚本临时替换 page.tsx → 失败（"use client" 组件不能导出 generateStaticParams）
- 尝试 stash server-only routes（mock API、auth API）→ 仍然失败
- 最终切换到 `output: 'standalone'`

**后果:**
- standalone 模式需要 Node.js 运行时，包体积从预期的 ~500MB 膨胀到 2.3GB
- Tauri WebView 从加载本地文件变成连接 localhost:3000，引入了进程管理复杂度
- Next.js standalone 的 node_modules 不完整（pnpm symlink 结构问题），需要额外 `npm install`

**教训:**
- 应该在写第一行代码之前，先用一个最小 demo 验证 Next.js static export 是否可行
- 现有项目大量使用动态路由和 server-side 功能，static export 从一开始就不现实
- 正确做法: 要么一开始就选 standalone + Node.js，要么重构前端为纯 SPA（工作量巨大）

### 问题 2: Tauri invoke 与 localhost 的矛盾

**现状:**
- `tauri.conf.json` 的 `frontendDist` 和 window `url` 都指向 `http://localhost:3000`
- Tauri 的 `__TAURI__` API 只在 `tauri://localhost` 或 `https://tauri.localhost` origin 下注入
- 当 WebView 加载 `http://localhost:3000` 时，`__TAURI__` 不可用
- 登录页的 `import("@tauri-apps/api/core")` 会失败 → 登录流程完全断裂

**后果:**
- 用户无法登录 → 无法从 Sync Service 拉取模型配置 → config.yaml 不存在 → Python 后端不启动 → 发消息无反应

**教训:**
- Tauri 2.x 的 IPC 机制要求前端必须从 Tauri 协议加载，不能是普通 HTTP
- 选择 standalone 模式后，应该用 Tauri 的 `custom-protocol` 代理请求到 localhost:3000，而不是直接让 WebView 连 HTTP
- 或者: 登录/配置流程不依赖 Tauri invoke，改用直接 HTTP 调用 Sync Service

### 问题 3: Python sidecar 启动条件未满足

**现状:**
- `main.rs` 中 Python 后端启动的前提是 `config.yaml` 存在
- `config.yaml` 由 `pull_model_configs` Tauri command 生成
- 但 `pull_model_configs` 需要先登录拿到 token
- 登录需要 Tauri invoke → 见问题 2

**后果:**
- 形成死锁: 登录 → 需要 Tauri API → 需要 Tauri 协议 → 但用的是 HTTP → 登录失败 → 无 config → 后端不启动

**教训:**
- 应该设计一个不依赖 Tauri IPC 的 fallback 启动流程
- 或者: 首次启动时提供一个默认 config.yaml，让后端先启动，登录后再更新

### 问题 4: 资源打包的反复折腾

**经历的问题:**
1. `resources: {"resources/python/**": "./python/"}` glob 语法 → cargo check 时因为目录为空报错
2. 改为 `resources: ["resources/"]` → 打包时只复制了 backend 和 frontend，丢失了 node/python/venv
3. 改为显式列出 5 个子目录 → 终于全部打包进去
4. 但 `.app` 里的路径是 `Contents/Resources/resources/xxx`，sidecar 代码最初只找 `Contents/Resources/xxx` → 找不到
5. 添加 `resolve_resources()` 函数处理路径偏移 → 修复

**教训:**
- Tauri 的 resource bundling 行为不直观，应该先写一个最小 demo 验证
- 2.3GB 的资源打包非常慢，每次修改重新打包需要 5-10 分钟，严重拖慢调试效率
- 应该先用 `cargo tauri dev` 在开发模式下跑通，再打 release bundle

### 问题 5: Next.js standalone 的 node_modules 不完整

**原因:**
- 项目使用 pnpm，node_modules 是 symlink 结构
- Next.js standalone 输出只复制了部分依赖，pnpm 的 symlink 没有被正确解析
- 缺失 69 个包（styled-jsx, @swc/helpers, 所有 @radix-ui 等）

**解决:**
- 在 standalone 目录执行 `npm install --omit=dev --legacy-peer-deps`
- npm cache 权限问题需要 `sudo rm -rf ~/.npm/_cacache`

**教训:**
- pnpm + Next.js standalone 是已知的兼容性问题，应该提前调研
- 构建脚本应该自动执行 npm install 补全依赖

### 问题 6: 端口残留导致白屏

**现象:**
- 之前测试的 node 进程没有被正确 kill，占据了 3000 端口
- 新启动的 Next.js 绑定 3000 失败 → Tauri 窗口连接 localhost:3000 → 白屏

**解决:**
- 添加了 `kill_port_occupant()` 函数，启动前清理 3000/8001/2024 端口

**教训:**
- sidecar 进程的 stdout/stderr 被 `Stdio::piped()` 吞掉了，出错时看不到任何日志
- 应该把子进程日志写到文件，方便调试
- 应该在启动前检查端口是否可用，而不是盲目启动

---

## 三、时间花费分析

| 阶段 | 预期 | 实际 | 原因 |
|------|------|------|------|
| Sync Service 开发 | 2h | 2h | 顺利，FastAPI 熟悉 |
| Tauri 项目搭建 | 1h | 1h | 顺利 |
| Rust sidecar 代码 | 2h | 4h | Send/Sync trait 问题、重复编辑导致代码混乱 |
| Next.js static export | 2h | 3h | 完全失败，浪费时间 |
| 切换 standalone + 修复 | 1h | 3h | pnpm 兼容性、npm cache 权限 |
| 资源打包调试 | 0.5h | 3h | 路径问题反复、2.3GB 打包慢 |
| 端口/启动问题 | 0h | 2h | 残留进程、日志不可见 |
| **总计** | **8.5h** | **18h+** | 超出预期 2 倍 |

---

## 四、当前遗留的所有 Bug

### P0 — 功能完全不可用
1. **登录流程断裂**: Tauri `__TAURI__` API 在 http://localhost:3000 下不可用，invoke("login") 无法调用
2. **Python 后端未启动**: 没有 config.yaml → Gateway (8001) 和 LangGraph (2024) 都没启动
3. **发消息无反应**: 前端发消息 → 调用 Gateway/LangGraph API → 连接拒绝

### P1 — 功能缺失
4. **模型选择器不工作**: 前端的模型列表从 Gateway API 获取，Gateway 没启动所以为空
5. **MCP/技能页面报错**: 技能列表从 Gateway 获取，返回 404
6. **Sync Engine 未验证**: checkpoint/memory 同步代码写了但从未实际运行过
7. **登录后 token 未持久化**: tauri-plugin-store 的 auth 恢复代码被注释掉了（TODO）
8. **登录后未触发后端重启**: 即使登录成功拉到 config.yaml，Python 后端也不会自动启动（只在 app 启动时检查一次）

### P2 — 体验问题
9. **包体积 2.3GB**: venv 占 1.1GB，需要清理不必要的依赖
10. **首次启动慢**: Node.js + Python 冷启动需要 10-15 秒，期间白屏无反馈
11. **无启动加载页**: 用户看到白屏不知道在加载还是崩溃了
12. **子进程日志不可见**: stdout/stderr 被 pipe 吞掉，出错时无法诊断
13. **退出时子进程可能残留**: kill_process 用 SIGTERM，如果子进程不响应会变成僵尸进程
14. **DMG 打包偶尔失败**: bundle_dmg.sh 对大文件不稳定，有时报错但 .app 已生成
15. **无应用图标**: 使用的是纯色占位 PNG，不是正式图标
16. **Windows 构建未验证**: 只测试了 macOS，NSIS 打包完全未测试

### P3 — 代码质量
17. **sidecar.rs 被反复重写 3 次**: 多次编辑导致代码混乱，有残留的重复函数
18. **Rust 代码有 2 个 dead_code warning**: SyncState.user_id 和 MemoryPullResponse 的字段未使用
19. **build-frontend.sh 的 wrapper 逻辑已废弃**: 切换到 standalone 后脚本内容过时
20. **config.yaml 生成逻辑在 Rust 里硬编码**: render_config_yaml() 用字符串拼接，容易出错
21. **Sync Service 没有任何测试**: tests/ 目录是空的
22. **前端 @tauri-apps/api 依赖加了但从未在 WebView 中实际工作过**

---

## 五、要让它真正工作，还需要做什么

### 方案 A: 修复当前架构（最小改动）
1. **解决 Tauri IPC 问题**: 用 Tauri 的 `invoke` HTTP endpoint 或改用 `custom-protocol` 代理
2. **登录流程改为 HTTP 直连**: 前端直接调用 Sync Service API（不经过 Tauri invoke），token 存 localStorage
3. **config.yaml 生成改为前端逻辑**: 登录成功后前端直接调用 Sync Service 拿模型配置，通过 Gateway API 写入
4. **添加后端热重启**: 登录成功后通过 Tauri command 触发 Python 后端启动
5. **添加启动加载页**: 在 Next.js 里加一个 loading 状态，等后端 health check 通过再显示主界面

预计工作量: 2-3 天

### 方案 B: 简化架构（推荐）
1. **放弃 Tauri invoke 登录**: 前端直接 HTTP 调用 Sync Service，不依赖 Tauri IPC
2. **预置默认 config.yaml**: 首次启动时生成一个空的 config.yaml，让后端先启动
3. **模型配置改为前端 UI**: 在 workspace 设置页直接配置模型（调 Sync Service API），不需要 admin-cli
4. **去掉 Python/venv 打包**: 改为首次启动时自动下载安装（类似 VS Code 的 language server）

预计工作量: 3-5 天

### 方案 C: 换技术路线（如果当前路线证明不可行）
1. **放弃本地 Python 后端**: 所有 Agent 逻辑跑在云端，桌面端只是一个 thin client
2. **Tauri 只做 WebView 壳**: 连接云端服务，不需要 sidecar
3. **包体积降到 ~50MB**

预计工作量: 1-2 周（需要部署云端后端）

---

## 六、关键教训总结

1. **先验证再编码**: 应该用最小 demo 验证 Next.js static export、Tauri IPC、Python sidecar 这三个高风险点，而不是直接在完整项目上开工
2. **不要同时做太多事**: Sync Service + Tauri + 前端适配 + Python 打包 + 构建脚本，5 条线并行导致每条都没做透
3. **pnpm + Next.js standalone 是坑**: 这是已知问题，应该提前调研
4. **Tauri 2.x 的 IPC 限制**: WebView 加载 HTTP URL 时 `__TAURI__` 不可用，这是架构级的约束，应该在设计阶段就考虑
5. **大文件打包极慢**: 2.3GB 的 .app 每次重新打包需要 5-10 分钟，严重影响调试效率。应该先在开发模式下跑通所有功能，最后再打包
6. **子进程管理比想象中复杂**: 端口占用、进程残留、日志不可见、启动顺序依赖，每个都是坑
7. **现有设计文档（hybrid-desktop-client.md）的方案更合理**: 它建议用 PyInstaller 而不是 bundled Python + venv，虽然 PyInstaller 有自己的问题，但至少包体积可控

---

## 七、文件清单

### 新建文件（35 个）

**sync-service/**（17 个）
- `pyproject.toml` — 项目依赖
- `Dockerfile` — Docker 构建
- `docker-compose.yaml` — Docker Compose 编排
- `.env` — 环境变量（JWT secret、加密密钥、管理员账号）
- `app/__init__.py`
- `app/main.py` — FastAPI 应用入口
- `app/models.py` — 8 张数据库表
- `app/auth.py` — JWT 认证
- `app/crypto.py` — AES-256 加密
- `app/database.py` — async PostgreSQL 连接
- `app/routers/__init__.py`
- `app/routers/auth.py` — 注册/登录/刷新
- `app/routers/models.py` — 模型配置 CRUD
- `app/routers/sync_checkpoints.py` — checkpoint 同步
- `app/routers/sync_memory.py` — memory 同步
- `app/routers/sync_settings.py` — settings 同步
- `tests/__init__.py`

**desktop/src-tauri/**（12 个）
- `Cargo.toml` — Rust 依赖
- `Cargo.lock`
- `build.rs`
- `tauri.conf.json` — Tauri 配置
- `capabilities/default.json` — 权限声明
- `icons/` — 占位图标（5 个文件）
- `src/main.rs` — Tauri 入口、命令、生命周期
- `src/sidecar.rs` — 进程管理
- `src/sync/mod.rs` — 同步引擎主模块
- `src/sync/checkpoint_sync.rs` — checkpoint 同步
- `src/sync/memory_sync.rs` — memory 同步
- `src/sync/pull.rs` — 新设备拉取
- `src/sync/watermark.rs` — 同步水位线

**scripts/desktop/**（3 个）
- `build-all.sh` — 全流程构建
- `build-frontend.sh` — 前端构建
- `build-python-sidecar.sh` — Python sidecar 构建
- `admin-cli.py` — 管理工具

**frontend/**（1 个新建）
- `src/components/workspace/sync-status.tsx` — 同步状态指示器

### 修改文件（8 个）
- `frontend/next.config.js` — 添加 standalone 输出模式
- `frontend/package.json` — 添加 @tauri-apps/api 依赖
- `frontend/src/core/config/index.ts` — 添加 isTauriEnvironment() 和本地端口直连
- `frontend/src/middleware.ts` — 桌面模式跳过 server-side auth
- `frontend/src/app/(auth)/login/page.tsx` — 双模式登录（Web/Desktop）
- `frontend/src/components/workspace/workspace-sidebar.tsx` — 集成 SyncStatus 组件
- `backend/app/gateway/config.py` — 桌面模式 CORS origins
- `.gitignore` — 添加 desktop/sync-service 忽略规则
