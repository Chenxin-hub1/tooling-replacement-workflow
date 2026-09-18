#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_root/backend"
uv sync --locked --extra dev
uv run pytest -q -W error
uv run ruff check app tests migrations
uv run ruff format --check app tests migrations
uv run ty check app tests
cd "$project_root/frontend"
bun install --frozen-lockfile
bun run format:check
bun run test
node --check public/workspace.js
node --check public/improvements.js
node --check public/workflow-core.js
bun run build
bun run test:e2e
