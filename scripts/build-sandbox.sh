#!/usr/bin/env bash
# Build the image that generated tests execute in. Run once, and again whenever
# backend/sandbox/Dockerfile changes.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${REQTEST_SANDBOX_IMAGE:-reqtest-sandbox:1}"
command -v docker >/dev/null 2>&1 || {
  echo "Docker is required to execute generated tests. Install Docker, then run this again." >&2
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "The Docker daemon is not running. Start Docker, then run this again." >&2
  exit 1
}
docker build -t "$IMAGE" "$ROOT/backend/sandbox"
echo "Built $IMAGE. Test execution is now available."
