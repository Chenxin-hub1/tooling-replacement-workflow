#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_root/frontend"
bun install --frozen-lockfile
bun run build
cd "$project_root/backend"
uv sync --locked
exec uv run --no-sync uvicorn app.main:app --host "${TOOLING_HOST:-127.0.0.1}" --port "${TOOLING_PORT:-8000}"
