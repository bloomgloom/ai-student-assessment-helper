#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PRODUCT_NAME=$(node -p "require('./package.json').build.productName")
ARCH=$(uname -m | sed 's/x86_64/x64/')
APP_PATH="${1:-release/mac-${ARCH}/${PRODUCT_NAME}.app}"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: .app not found at $APP_PATH"
  exit 1
fi

if codesign --verify --deep --strict "$APP_PATH" >/dev/null 2>&1; then
  echo "Valid app signature: $APP_PATH"
  exit 0
fi

echo "Applying fallback signature: $APP_PATH"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
