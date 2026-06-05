#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm install
npm install --prefix assessment
npm run python:setup
npm run build:mac

echo
echo "macOS build complete."
echo "Output: $ROOT_DIR/release"
echo "Note: requires 'brew install create-dmg' for DMG packaging"
