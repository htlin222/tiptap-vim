#!/usr/bin/env bash
#
# Publish all public @prose-motions/* packages to npm in dependency order.
#
# Auth: reads NPM_TOKEN from .env (an npm Automation token, which bypasses 2FA).
#       The project .npmrc references ${NPM_TOKEN}, so bun publish picks it up.
#
# Usage:
#   1. Copy .env.example -> .env and paste your token.
#   2. bash scripts/publish.sh            # publish all
#      bash scripts/publish.sh --dry-run  # pack only, publish nothing
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env (export every assignment).
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

if [ -z "${NPM_TOKEN:-}" ]; then
  echo "ERROR: NPM_TOKEN is empty. Paste your npm Automation token into .env (see .env.example)." >&2
  exit 1
fi

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

# Dependency order: a package's @prose-motions deps must be published before it.
PKGS=(engine styles adapter core pm statusbar-vanilla statusbar-react)

for p in "${PKGS[@]}"; do
  echo "########## @prose-motions/$p ##########"
  (
    cd "packages/$p"
    bun run build
    bun publish --access public $DRY
  )
  echo
done

echo "✅ Done."
