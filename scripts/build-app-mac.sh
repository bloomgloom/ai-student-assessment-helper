#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm install
npm install --prefix assessment
npm install --prefix assignment
npm run python:setup
npm run build:mac:app

echo
echo "macOS app build complete."
echo "Output: $ROOT_DIR/release/mac-$(uname -m | sed 's/x86_64/x64/')"
echo "To create a DMG separately, run: ./scripts/create-dmg-mac.sh"
