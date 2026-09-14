#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v node >/dev/null 2>&1 && [[ -x "$ROOT/.tools/node/bin/node" ]]; then
  export PATH="$ROOT/.tools/node/bin:$PATH"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 22.13+ (see .nvmrc), then run this script again." >&2
  exit 1
fi
if [[ ! -x "$ROOT/backend/.venv/bin/python" || ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "Dependencies are missing. Run: bash scripts/setup.sh" >&2
  exit 1
fi

# Check the documented ports before starting either process; do not kill existing services.
"$ROOT/backend/.venv/bin/python" - <<'PY'
import socket
for port in (3000, 8000):
    with socket.socket() as sock:
        try:
            sock.bind(('127.0.0.1', port))
        except OSError:
            raise SystemExit(f'Port {port} is already in use. Stop that service first.')
PY

backend_pid=""
frontend_pid=""
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$backend_pid" ]] || kill "$backend_pid" 2>/dev/null || true
  [[ -z "$frontend_pid" ]] || kill "$frontend_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM
(
  cd "$ROOT/backend"
  exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) &
backend_pid=$!
(
  cd "$ROOT/frontend"
  # Run Node directly so the retained PID belongs to the frontend process.
  exec node node_modules/vinext/dist/cli.js dev --host 127.0.0.1 --port 3000
) &
frontend_pid=$!
echo "Frontend: http://localhost:3000 | API docs: http://127.0.0.1:8000/docs"
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done
exit 1
