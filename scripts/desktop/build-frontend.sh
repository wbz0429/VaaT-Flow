#!/usr/bin/env bash
# Build the Next.js frontend for Tauri desktop (standalone mode).
# Output: copies .next/standalone + .next/static into desktop/src-tauri/resources/frontend/
#
# Usage: bash scripts/desktop/build-frontend.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
RESOURCES_DIR="$PROJECT_ROOT/desktop/src-tauri/resources/frontend"

echo "==> Building Next.js frontend for desktop (standalone)..."

cd "$FRONTEND_DIR"

rm -rf .next

BUILD_TARGET=desktop \
SKIP_ENV_VALIDATION=1 \
BETTER_AUTH_SECRET=desktop-local-secret \
pnpm build

echo "==> Copying standalone output to Tauri resources..."
rm -rf "$RESOURCES_DIR"
mkdir -p "$RESOURCES_DIR"

# Copy standalone server
cp -r .next/standalone/. "$RESOURCES_DIR/"

# Copy static assets (not included in standalone by default)
cp -r .next/static "$RESOURCES_DIR/.next/static"

# Copy public assets
if [ -d public ]; then
    cp -r public "$RESOURCES_DIR/public"
fi

echo "==> Frontend build complete: $RESOURCES_DIR/"
du -sh "$RESOURCES_DIR"
