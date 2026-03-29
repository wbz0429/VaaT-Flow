#!/usr/bin/env python3
"""VaaT-Flow Sync Service 管理工具 — 配置模型、管理用户。

用法:
    python3 scripts/desktop/admin-cli.py

零依赖，只用 Python 标准库。
"""

import getpass
import json
import sys
import urllib.request
import urllib.error

SYNC_URL = "http://localhost:8080"
TOKEN = None


def api(method, path, data=None, expect_json=True):
    """发送 HTTP 请求，返回 (status_code, body)。"""
    url = f"{SYNC_URL}{path}"
    body = json.dumps(data).encode("utf-8") if data else None

    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")

    try:
        resp = urllib.request.urlopen(req, timeout=10)
        raw = resp.read().decode("utf-8")
        if expect_json and raw:
            return resp.status, json.loads(raw)
        return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8") if e.fp else ""
        if expect_json and raw:
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError:
                pass
        return e.code, raw
    except urllib.error.URLError as e:
        return 0, str(e.reason)


def login():
    global TOKEN
    print("\n=== 管理员登录 ===")
    email = input("邮箱 [admin@vaatflow.com]: ").strip() or "admin@vaatflow.com"
    password = getpass.getpass("密码: ")

    code, data = api("POST", "/auth/login", {"email": email, "password": password})
    if code != 200:
        print(f"登录失败 ({code}): {data}")
        return False

    TOKEN = data["token"]
    print(f"登录成功! 用户: {data['name']} ({data['role']})")
    return True


def list_models():
    print("\n=== 当前模型列表 ===")
    code, models = api("GET", "/admin/models")
    if code != 200:
        print(f"获取失败 ({code}): {models}")
        return

    if not models:
        print("  (空，还没有配置任何模型)")
        return

    for i, m in enumerate(models, 1):
        status = "启用" if m["enabled"] else "禁用"
        key_status = "已配置" if m["has_api_key"] else "未配置"
        thinking = " | 思考" if m["supports_thinking"] else ""
        vision = " | 视觉" if m["supports_vision"] else ""
        print(f"  {i}. [{status}] {m['display_name']} ({m['name']})")
        print(f"     模型: {m['model']} | 类: {m['use_class']}")
        print(f"     API Base: {m.get('api_base') or '默认'} | Key: {key_status}{thinking}{vision}")
        print()


def add_model():
    print("\n=== 添加模型 ===")
    print("选择 use_class（大部分中转都兼容 OpenAI 接口，选 1 即可）:")
    print("  1. langchain_openai:ChatOpenAI           (OpenAI / 所有 OpenAI 兼容中转)")
    print("  2. langchain_anthropic:ChatAnthropic      (Anthropic 原生 / Anthropic 兼容中转)")
    print("  3. langchain_google_genai:ChatGoogleGenerativeAI (Gemini)")
    print("  4. deerflow.models.patched_deepseek:PatchedChatDeepSeek (DeepSeek 原生)")
    print("  5. langchain_openai:ChatOpenAI            (Claude 通过 OpenAI 兼容中转)")
    print("  6. langchain_openai:ChatOpenAI            (Gemini 通过 OpenAI 兼容中转)")
    print("  7. langchain_openai:ChatOpenAI            (DeepSeek 通过 OpenAI 兼容中转)")
    print("  8. langchain_openai:ChatOpenAI            (其他任意模型通过 OpenAI 兼容中转)")
    print("  或直接输入完整 class path")
    print()
    print("  提示: 如果你用的是中转服务（如 one-api、new-api、openrouter 等），")
    print("        基本都兼容 OpenAI 接口，选 1 然后填中转的 API Base URL 和 Key 就行。")
    print()

    name = input("模型标识名 (英文，如 gpt-4o): ").strip()
    if not name:
        print("取消")
        return

    display_name = input(f"显示名称 [{name}]: ").strip() or name

    use_choice = input("use_class 选择 (1-8 或直接输入): ").strip()
    use_map = {
        "1": "langchain_openai:ChatOpenAI",
        "2": "langchain_anthropic:ChatAnthropic",
        "3": "langchain_google_genai:ChatGoogleGenerativeAI",
        "4": "deerflow.models.patched_deepseek:PatchedChatDeepSeek",
        "5": "langchain_openai:ChatOpenAI",
        "6": "langchain_openai:ChatOpenAI",
        "7": "langchain_openai:ChatOpenAI",
        "8": "langchain_openai:ChatOpenAI",
    }
    use_class = use_map.get(use_choice, use_choice)

    model = input("模型 ID (如 gpt-4o, claude-3-5-sonnet): ").strip()
    api_base = input("API Base URL (留空用默认): ").strip() or None
    api_key = getpass.getpass("API Key: ").strip() or None

    thinking = input("支持思考模式? (y/N): ").strip().lower() == "y"
    vision = input("支持视觉? (y/N): ").strip().lower() == "y"

    extra = {}
    max_tokens = input("max_tokens (留空用默认): ").strip()
    if max_tokens:
        extra["max_tokens"] = int(max_tokens)
    temperature = input("temperature (留空用默认): ").strip()
    if temperature:
        extra["temperature"] = float(temperature)

    payload = {
        "name": name,
        "display_name": display_name,
        "use_class": use_class,
        "model": model,
        "api_base": api_base,
        "api_key": api_key,
        "supports_thinking": thinking,
        "supports_vision": vision,
        "extra_config": extra,
    }

    print(f"\n即将添加: {display_name} ({use_class} / {model})")
    confirm = input("确认? (Y/n): ").strip().lower()
    if confirm == "n":
        print("取消")
        return

    code, data = api("POST", "/admin/models", payload)
    if code == 201:
        print("添加成功!")
    else:
        print(f"添加失败 ({code}): {data}")


def delete_model():
    print("\n=== 删除模型 ===")
    code, models = api("GET", "/admin/models")
    if not models or code != 200:
        print("没有模型可删除")
        return

    for i, m in enumerate(models, 1):
        print(f"  {i}. {m['display_name']} ({m['name']}) - ID: {m['id']}")

    choice = input("输入序号删除 (0 取消): ").strip()
    if not choice or choice == "0":
        return

    idx = int(choice) - 1
    if idx < 0 or idx >= len(models):
        print("无效序号")
        return

    model = models[idx]
    confirm = input(f"确认删除 {model['display_name']}? (y/N): ").strip().lower()
    if confirm != "y":
        return

    code, data = api("DELETE", f"/admin/models/{model['id']}", expect_json=False)
    if code == 204:
        print("删除成功!")
    else:
        print(f"删除失败 ({code}): {data}")


def create_user():
    print("\n=== 创建用户账号 ===")
    email = input("邮箱: ").strip()
    if not email:
        return
    name = input(f"姓名 [{email.split('@')[0]}]: ").strip() or email.split("@")[0]
    password = getpass.getpass("密码: ")

    code, data = api("POST", "/auth/register", {
        "email": email,
        "password": password,
        "name": name,
    })
    if code == 200:
        print(f"用户创建成功: {name} ({email})")
    else:
        print(f"创建失败 ({code}): {data}")


def main():
    global SYNC_URL
    print("=" * 50)
    print("  VaaT-Flow Sync Service 管理工具")
    print("=" * 50)

    url = input(f"Sync Service 地址 [{SYNC_URL}]: ").strip()
    if url:
        SYNC_URL = url.rstrip("/")

    # 检查连接
    code, data = api("GET", "/health")
    if code == 0:
        print(f"无法连接到 {SYNC_URL}: {data}")
        print("请确认 Sync Service 已启动 (docker compose up -d)")
        return
    print(f"连接成功: {data}")

    if not login():
        return

    while True:
        print("\n--- 操作菜单 ---")
        print("  1. 查看模型列表")
        print("  2. 添加模型")
        print("  3. 删除模型")
        print("  4. 创建用户账号")
        print("  0. 退出")

        choice = input("\n选择: ").strip()
        if choice == "1":
            list_models()
        elif choice == "2":
            add_model()
        elif choice == "3":
            delete_model()
        elif choice == "4":
            create_user()
        elif choice == "0":
            print("再见!")
            break
        else:
            print("无效选择")


if __name__ == "__main__":
    main()
