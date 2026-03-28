# Allo 部署指南

## 前置条件

- **Git**
- **Docker Desktop**（含 Docker Compose）

不需要安装 Python、Node.js 或其他开发工具。

## 快速部署

```bash
# 克隆项目
git clone <repo-url>
cd deer-flow

# 设置模型服务（见下方「模型配置」章节）
export PLATFORM_MODEL_API_KEY="sk-your-key"
export PLATFORM_MODEL_BASE_URL="https://your-relay.com/v1"

# 一键启动
make up
```

等待 2-3 分钟构建完成后，浏览器打开 http://localhost:2026。

## 首次 Setup 向导

首次访问会自动跳转到 `/setup`，按步骤完成：

1. **创建管理员账号** — 填写邮箱、密码、昵称
2. **配置模型 Provider** — 选择模型服务来源（详见下方）
3. **配置搜索服务**（可选）— 填写 Tavily / Jina API key
4. **完成** — 自动跳转到工作区，开始使用

## 模型配置

Setup 向导提供 6 种 Provider 选项：

| 选项 | 协议 | 需要 API Key | 需要 Base URL | 适用场景 |
|---|---|---|---|---|
| Platform Default GPT | OpenAI | 否 | 否 | 运营方预配置中转服务 |
| Platform Default Claude | Anthropic | 否 | 否 | 运营方预配置中转服务 |
| OpenAI Official | OpenAI | 是 | 否 | 直连 OpenAI 官方 API |
| Anthropic Official | Anthropic | 是 | 否 | 直连 Anthropic 官方 API |
| Custom OpenAI-Compatible | OpenAI | 是 | 是 | 任意 OpenAI 兼容 API（中转、one-api 等） |
| Custom Anthropic-Compatible | Anthropic | 是 | 是 | 任意 Anthropic 兼容 API |

### 方式 A：运营方预配置（推荐）

启动前设置环境变量，用户 setup 时选 Platform Default，零输入：

```bash
export PLATFORM_MODEL_API_KEY="sk-your-key"
export PLATFORM_MODEL_BASE_URL="https://your-relay.com/v1"
make up
```

中转服务需兼容 OpenAI `/v1/chat/completions` 接口（one-api、new-api 等均支持）。

### 方式 B：用户自配置

不设环境变量直接启动，用户在 setup 向导中选择 Custom OpenAI-Compatible，自行填写 API Key 和 Base URL：

```bash
make up
```

### 方式 C：直连官方 API

用户在 setup 向导中选择 OpenAI Official 或 Anthropic Official，填写官方 API Key。需确保网络可直连对应 API 服务。

## 常用命令

```bash
make up          # 构建并启动所有服务
make down        # 停止并移除容器
make docker-logs # 查看日志
```

## 服务架构

`make up` 启动 5 个容器：

| 服务 | 端口 | 说明 |
|---|---|---|
| nginx | 2026（对外） | 反向代理，统一入口 |
| frontend | 3000（内部） | Next.js 前端 |
| gateway | 8001（内部） | FastAPI 网关（认证、setup、配置管理） |
| langgraph | 2024（内部） | LangGraph Agent 运行时 |
| postgres | 5432（内部） | PostgreSQL 数据库（用户、设置） |

所有服务通过 nginx 统一暴露在 `localhost:2026`。

## 故障排查

### 模型调用报 403 / 区域限制

中转服务的 `base_url` 未配置。检查：
- 方式 A：确认 `PLATFORM_MODEL_BASE_URL` 环境变量已设置
- 方式 B：确认 setup 时填写了正确的 Base URL

### 对话发送后无回复（run 卡住）

检查 langgraph 日志：
```bash
docker compose -p deer-flow -f docker/docker-compose.yaml logs langgraph --tail=30
```

确认日志中显示 `Starting 4 background workers`（而非 1）。

### 服务启动后 502

nginx 可能缓存了旧容器 IP，重启 nginx：
```bash
docker compose -p deer-flow -f docker/docker-compose.yaml restart nginx
```
