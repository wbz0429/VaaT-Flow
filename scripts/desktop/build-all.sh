#!/usr/bin/env bash
# Full desktop build: frontend + Python sidecar + Node.js + Tauri bundle → dmg/exe
#
# Usage: bash scripts/desktop/build-all.sh
#
# 产出: desktop/src-tauri/target/release/bundle/dmg/VaaT-Flow_0.1.0_aarch64.dmg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESOURCES_DIR="$PROJECT_ROOT/desktop/src-tauri/resources"

echo "============================================"
echo "  VaaT-Flow Desktop 完整构建"
echo "============================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Build frontend (Next.js standalone)
# ---------------------------------------------------------------------------
echo ">>> [1/4] 构建前端..."
cd "$PROJECT_ROOT/frontend"
rm -rf .next
BUILD_TARGET=desktop SKIP_ENV_VALIDATION=1 BETTER_AUTH_SECRET=desktop-local-secret pnpm build

rm -rf "$RESOURCES_DIR/frontend"
mkdir -p "$RESOURCES_DIR/frontend"
cp -r .next/standalone/. "$RESOURCES_DIR/frontend/"
cp -r .next/static "$RESOURCES_DIR/frontend/.next/static"
[ -d public ] && cp -r public "$RESOURCES_DIR/frontend/public"
echo "    前端构建完成: $(du -sh "$RESOURCES_DIR/frontend" | cut -f1)"

# ---------------------------------------------------------------------------
# Step 2: Download Node.js (for running Next.js standalone)
# ---------------------------------------------------------------------------
echo ""
echo ">>> [2/4] 下载 Node.js..."

NODE_VERSION="22.16.0"
case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)  NODE_PLATFORM="darwin-arm64" ;;
    Darwin-x86_64) NODE_PLATFORM="darwin-x64" ;;
    Linux-x86_64)  NODE_PLATFORM="linux-x64" ;;
    *)             echo "不支持的平台"; exit 1 ;;
esac

NODE_FILENAME="node-v${NODE_VERSION}-${NODE_PLATFORM}.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILENAME}"
CACHE_DIR="$PROJECT_ROOT/.cache"
mkdir -p "$CACHE_DIR"

if [ ! -f "$CACHE_DIR/$NODE_FILENAME" ]; then
    echo "    下载: $NODE_URL"
    curl -L -o "$CACHE_DIR/$NODE_FILENAME" "$NODE_URL"
else
    echo "    使用缓存: $CACHE_DIR/$NODE_FILENAME"
fi

rm -rf "$RESOURCES_DIR/node"
mkdir -p "$RESOURCES_DIR/node"
tar xzf "$CACHE_DIR/$NODE_FILENAME" -C "$RESOURCES_DIR/node" --strip-components=1
echo "    Node.js: $("$RESOURCES_DIR/node/bin/node" --version) ($(du -sh "$RESOURCES_DIR/node" | cut -f1))"

# ---------------------------------------------------------------------------
# Step 3: Build Python sidecar
# ---------------------------------------------------------------------------
echo ""
echo ">>> [3/4] 构建 Python sidecar..."
bash "$SCRIPT_DIR/build-python-sidecar.sh" --platform auto

# ---------------------------------------------------------------------------
# Step 4: Build Tauri app
# ---------------------------------------------------------------------------
echo ""
echo ">>> [4/4] 构建 Tauri 桌面应用..."
cd "$PROJECT_ROOT/desktop"
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
cargo tauri build 2>&1

echo ""
echo "============================================"
echo "  构建完成!"
echo "============================================"
echo ""
echo "安装包位置:"
echo "  macOS: desktop/src-tauri/target/release/bundle/dmg/"
echo "  Windows: desktop/src-tauri/target/release/bundle/nsis/"
echo ""
ls -la "$PROJECT_ROOT/desktop/src-tauri/target/release/bundle/dmg/" 2>/dev/null || echo "(dmg 目录不存在)"
