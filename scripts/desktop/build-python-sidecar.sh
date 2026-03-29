#!/usr/bin/env bash
# Build the Python sidecar for Tauri desktop packaging.
# Downloads python-build-standalone, creates a venv with all backend deps,
# and copies everything into desktop/src-tauri/resources/.
#
# Usage: bash scripts/desktop/build-python-sidecar.sh [--platform macos-arm64|macos-x64|windows-x64]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
RESOURCES_DIR="$PROJECT_ROOT/desktop/src-tauri/resources"

PYTHON_VERSION="3.12.7"
PBS_VERSION="20241016"  # python-build-standalone release tag

# Detect platform
PLATFORM="${1:---platform}"
if [[ "$PLATFORM" == "--platform" ]]; then
    shift || true
    PLATFORM="${1:-auto}"
fi

if [[ "$PLATFORM" == "auto" ]]; then
    case "$(uname -s)-$(uname -m)" in
        Darwin-arm64)  PLATFORM="macos-arm64" ;;
        Darwin-x86_64) PLATFORM="macos-x64" ;;
        Linux-x86_64)  PLATFORM="linux-x64" ;;
        MINGW*|MSYS*)  PLATFORM="windows-x64" ;;
        *)             echo "Unsupported platform: $(uname -s)-$(uname -m)"; exit 1 ;;
    esac
fi

echo "==> Building Python sidecar for: $PLATFORM"
echo "==> Project root: $PROJECT_ROOT"

# Map platform to python-build-standalone archive name
case "$PLATFORM" in
    macos-arm64)
        PBS_TRIPLE="aarch64-apple-darwin"
        PYTHON_BIN="bin/python3"
        ;;
    macos-x64)
        PBS_TRIPLE="x86_64-apple-darwin"
        PYTHON_BIN="bin/python3"
        ;;
    windows-x64)
        PBS_TRIPLE="x86_64-pc-windows-msvc"
        PYTHON_BIN="python.exe"
        ;;
    linux-x64)
        PBS_TRIPLE="x86_64-unknown-linux-gnu"
        PYTHON_BIN="bin/python3"
        ;;
    *)
        echo "Unknown platform: $PLATFORM"
        exit 1
        ;;
esac

PBS_FILENAME="cpython-${PYTHON_VERSION}+${PBS_VERSION}-${PBS_TRIPLE}-install_only_stripped.tar.gz"
PBS_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PBS_VERSION}/${PBS_FILENAME}"

# ---------------------------------------------------------------------------
# Step 1: Download python-build-standalone
# ---------------------------------------------------------------------------
CACHE_DIR="$PROJECT_ROOT/.cache/python-standalone"
mkdir -p "$CACHE_DIR"

if [[ ! -f "$CACHE_DIR/$PBS_FILENAME" ]]; then
    echo "==> Downloading Python standalone: $PBS_URL"
    curl -L -o "$CACHE_DIR/$PBS_FILENAME" "$PBS_URL"
else
    echo "==> Using cached Python standalone: $CACHE_DIR/$PBS_FILENAME"
fi

# ---------------------------------------------------------------------------
# Step 2: Extract Python to resources/python/
# ---------------------------------------------------------------------------
echo "==> Extracting Python runtime..."
rm -rf "$RESOURCES_DIR/python"
mkdir -p "$RESOURCES_DIR/python"

if [[ "$PLATFORM" == windows-* ]]; then
    # Windows archive extracts to python/
    tar xzf "$CACHE_DIR/$PBS_FILENAME" -C "$RESOURCES_DIR/"
else
    # Unix archives extract to python/
    tar xzf "$CACHE_DIR/$PBS_FILENAME" -C "$RESOURCES_DIR/"
fi

# Verify Python works
PYTHON_EXE="$RESOURCES_DIR/python/$PYTHON_BIN"
if [[ ! -x "$PYTHON_EXE" ]]; then
    echo "ERROR: Python executable not found at $PYTHON_EXE"
    ls -la "$RESOURCES_DIR/python/"
    exit 1
fi
echo "==> Python version: $($PYTHON_EXE --version)"

# ---------------------------------------------------------------------------
# Step 3: Create venv and install backend dependencies
# ---------------------------------------------------------------------------
echo "==> Creating virtual environment..."
rm -rf "$RESOURCES_DIR/venv"
"$PYTHON_EXE" -m venv "$RESOURCES_DIR/venv"

# Activate venv
if [[ "$PLATFORM" == windows-* ]]; then
    VENV_PYTHON="$RESOURCES_DIR/venv/Scripts/python.exe"
    VENV_PIP="$RESOURCES_DIR/venv/Scripts/pip.exe"
else
    VENV_PYTHON="$RESOURCES_DIR/venv/bin/python3"
    VENV_PIP="$RESOURCES_DIR/venv/bin/pip3"
fi

echo "==> Installing backend dependencies..."
# Install the harness package first (it's a workspace dependency)
"$VENV_PIP" install --no-cache-dir -e "$BACKEND_DIR/packages/harness"
# Install the main backend package
"$VENV_PIP" install --no-cache-dir -e "$BACKEND_DIR"

echo "==> Verifying installation..."
"$VENV_PYTHON" -c "import deerflow; print('deerflow OK')"
"$VENV_PYTHON" -c "import fastapi; print('fastapi OK')"
"$VENV_PYTHON" -c "import langchain; print('langchain OK')"

# ---------------------------------------------------------------------------
# Step 4: Copy backend source code
# ---------------------------------------------------------------------------
echo "==> Copying backend source..."
rm -rf "$RESOURCES_DIR/backend"
mkdir -p "$RESOURCES_DIR/backend"

# Copy essential files
cp -r "$BACKEND_DIR/packages" "$RESOURCES_DIR/backend/"
cp -r "$BACKEND_DIR/app" "$RESOURCES_DIR/backend/"
cp "$BACKEND_DIR/langgraph.json" "$RESOURCES_DIR/backend/"
cp "$BACKEND_DIR/pyproject.toml" "$RESOURCES_DIR/backend/"

# Copy skills
if [[ -d "$PROJECT_ROOT/skills" ]]; then
    cp -r "$PROJECT_ROOT/skills" "$RESOURCES_DIR/backend/"
fi

# ---------------------------------------------------------------------------
# Step 5: Report
# ---------------------------------------------------------------------------
echo ""
echo "==> Build complete!"
echo "    Python:  $RESOURCES_DIR/python/ ($(du -sh "$RESOURCES_DIR/python" | cut -f1))"
echo "    Venv:    $RESOURCES_DIR/venv/ ($(du -sh "$RESOURCES_DIR/venv" | cut -f1))"
echo "    Backend: $RESOURCES_DIR/backend/ ($(du -sh "$RESOURCES_DIR/backend" | cut -f1))"
TOTAL=$(du -sh "$RESOURCES_DIR" | cut -f1)
echo "    Total:   $TOTAL"
echo ""
echo "Next steps:"
echo "  1. cd desktop && cargo tauri build"
echo "  2. Find the installer in desktop/src-tauri/target/release/bundle/"
