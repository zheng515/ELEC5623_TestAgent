#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v node >/dev/null 2>&1 && [[ -x "$ROOT/.tools/node/bin/node" ]]; then
  export PATH="$ROOT/.tools/node/bin:$PATH"
fi
command -v node >/dev/null 2>&1 || { echo "Install Node.js 22.13+ first (see .nvmrc)." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Install Python 3.11+ first." >&2; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ is required"'
python3 -m venv "$ROOT/backend/.venv"
"$ROOT/backend/.venv/bin/python" -m pip install -r "$ROOT/backend/requirements-dev.lock"
"$ROOT/backend/.venv/bin/python" -m pip install --no-deps -e "$ROOT/backend"
cd "$ROOT/frontend"
npm ci
echo "Ready. Run: bash scripts/dev.sh"
echo "Set OPENAI_API_KEY in backend/.env to enable the agent stages."
echo "Run 'bash scripts/build-sandbox.sh' (needs Docker) to execute generated tests."

echo "Run 'bash scripts/setup-document-tools.sh' for scanned PDF OCR and legacy Word import."
"$ROOT/backend/.venv/bin/python" - <<'PYDOC'
from app.services.document_tools import DocumentOptions, document_capabilities
from app.core.config import Settings
state = document_capabilities(DocumentOptions.from_settings(Settings()))
print(f"Document tools: OCR={'ready' if state['ocr_ready'] else 'unavailable'}, legacy Word={'ready' if state['doc_ready'] else 'unavailable'}")
PYDOC
