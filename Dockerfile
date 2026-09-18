FROM oven/bun:1.3.14 AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
COPY .design/reference/ /build/.design/reference/
RUN bun run build

FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.12.0 /uv /usr/local/bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/README.md ./
COPY backend/app ./app
COPY backend/migrations ./migrations
COPY backend/alembic.ini ./
RUN uv sync --frozen --no-dev --no-editable
COPY --from=frontend /build/frontend/dist /app/frontend/dist
RUN useradd --create-home --uid 10001 tooling && mkdir /data && chown tooling:tooling /data
USER tooling
ENV DATABASE_URL=sqlite+aiosqlite:////data/tooling.db
ENV PATH="/app/backend/.venv/bin:$PATH"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
