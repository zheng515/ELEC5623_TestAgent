#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v node >/dev/null 2>&1 && [[ -x "$ROOT/.tools/node/bin/node" ]]; then
  export PATH="$ROOT/.tools/node/bin:$PATH"
fi
cd "$ROOT/backend"
.venv/bin/ruff check .
.venv/bin/pytest -q
cd "$ROOT/frontend"
npm run typecheck
npm run lint
npm run build
