# Tech stack

现代化全栈 Web 应用：FastAPI + SQLite + React (Vite + Tailwind CSS + shadcn/ui)，前后端解耦，单机/局域网可运行。

## 样板发布约束（2026-09-15 用户指令优先）

正式页面由 `.design/reference/tooling-replacement-workflow_3459.html` 生成，保留原生 HTML/CSS/JavaScript，不重新用组件库设计。Vite 负责静态打包，FastAPI + SQLite 保存完整工作区 JSON（含可编辑模板、人员职能与提醒规则），版本号防止并发覆盖。原 React 源码暂留作历史实现，不参与入口渲染；旧项目 API 不作为样板工作区的数据接口。

## Core

| Layer | Choice | Rationale |
| --- | --- | --- |
| Language | Python 3.11+ / TypeScript | 后端严谨类型安全与业务流转，前端现代组件化交互 |
| Runtime | Python (uv/venv) / Node.js (bun/npm) | 依赖管理便捷，快速启动 |
| Framework | FastAPI + React (Vite) | 极速异步接口、自动 OpenAPI 规范、现代组件化前端 |
| Data | SQLite + SQLAlchemy 2.0 (async) + openpyxl | 单文件零配置持久化，配合专业 Excel 处理库实现双向协同 |
| UI & Styling | Tailwind CSS + shadcn/ui + Lucide Icons | 还原高保真原型视觉质感，支持清晰的状态标签与进度条 |
| Testing | pytest / vitest | 覆盖核心调度算法与前后端关键交互路径 |

## Deployment

- 本地开发/单机使用：`uvicorn` 后端 + `npm run dev` 前端
- 交付部署：Docker 容器化多阶段打包 / 本地生产构建静态托管

## Ruled out

- 纯前端单机无后端架构 — 无法保证多并发、无法在服务端统一调度计算与批量安全持久化
- 笨重的大型企业级微服务框架 — 单体全栈架构足以支撑当前业务体量（数十至数百模具项目），避免过度工程化 (YAGNI)


<!-- module:backend-python -->
# Tech stack — Backend (Python)

Default for new projects; an existing project keeps its stack unless the user asks to change it. Layout: Netflix Dispatch style.

- Data contracts: pydantic, types-first — fields that travel together get a model before the code that uses them; raw dicts only at (de)serialization edges.
- API: FastAPI. HTTP client: httpx2. Workflow: pydantic-graph. Config: pydantic-settings.
- Background jobs: PgQueuer or Taskiq, chosen per project.
- Tests: pytest. Every outbound HTTP call goes through httpx2-pytest's `httpx2_mock` fixture; only tests marked integration hit real services.
- Tooling: uv (conda projects stay on conda), ruff, ty. Deploy: Docker + docker-compose.
- ruff is linter and formatter both; ≥ 0.16 its defaults are the rule set, `extend-select` only what the project needs.
- Symbols: navigate by LSP (`ty server`) — go-to-definition, references, hover — not text search.
<!-- /module:backend-python -->

<!-- module:database -->
# Database

Pick by how the data is written — every row that applies, since one project can hold both an app database and an analytics store — and record the choice in the project's stack notes. Whatever is picked: table models stay out of API signatures, and each DB sits behind its own connection-URL seam, so a choice can flip later without touching callers.

| Ask | Answer |
| --- | --- |
| Several processes or users write at the same time, or it gets deployed | **PostgreSQL** |
| One process writes, row-level transactions — an internal tool, a prototype, a CLI with state | **SQLite** |
| The data arrives as files (CSV / Parquet) and the questions are aggregates | **DuckDB + Polars** |

## PostgreSQL

- Prod is a real PostgreSQL instance; dev and tests run the official `postgres:<major>` image at the same major — one version everywhere, so a migration verified against the container (swap `DATABASE_URL`) is verified for prod. Migrations and SQL stay within that major's features.
- Driver: asyncpg. ORM & migrations: SQLAlchemy 2.0 + Alembic — async engine and session throughout (`env.py` runs migrations via `run_sync`); table models in `Mapped[]` declarative style.

## SQLite

- One file, WAL mode. Driver: aiosqlite. The same SQLAlchemy 2.0 + Alembic + `Mapped[]` setup as PostgreSQL, so moving up later is a URL change.

## DuckDB + Polars

- One database file, in-process, no container. Driver: `duckdb`; DataFrames are Polars, exchanged with DuckDB through Arrow at zero copy. The code is SQL plus DataFrame calls — an ORM is the exception, not the default (`duckdb-sqlalchemy` when models must be shared with an app).
<!-- /module:database -->

<!-- module:frontend-ts -->
# Tech stack — Frontend (TypeScript)

Default for new projects; an existing project keeps its stack unless the user asks to change it.

- Base: React + Vite + Tailwind CSS + shadcn/ui. Package manager: bun.
- Routing: TanStack Router. Server state: TanStack Query.
- API client & forms: openapi-ts generates the client and the zod schemas from FastAPI's OpenAPI; forms are react-hook-form + those schemas — generated, never hand-written.
- Testing: Vitest + Playwright.
- Symbols: navigate by LSP (tsserver) — go-to-definition, references, hover — not text search.
- Escape hatch: single-view / pure-chat UIs may omit TanStack Router and react-hook-form.
<!-- /module:frontend-ts -->

<!-- module:agent-dev -->
# Tech stack — Agent dev

Adds to the backend/frontend stack when the project is an AI-agent app.

## Backend

- Agents: pydantic-ai / Claude Agent SDK
- Lightweight sandbox: monty (Pydantic's lightweight Python interpreter for safely running untrusted / agent-generated code; experimental)
- Observability: OpenTelemetry — Logfire as a swappable OTLP backend
- Evals: pydantic-evals

## Frontend

- AI chat UI: Vercel AI SDK (useChat) + AI Elements
- Agent↔UI: Vercel AI Data Stream protocol; backend ModelMessage in Postgres is the source of truth, UI rebuilds from it
<!-- /module:agent-dev -->

## 本轮授权优化的接入位置

保持原生样板生成入口，`frontend/public/improvements.js` 承载已授权的导入/日期/校验修正，`workflow-core.js` 为独立测试规则，`mobile.css` 仅覆盖小屏。工作区 API 保留未来身份依赖接入位置；用户当前不启用账号或真实邮件/Teams。详见 `../docs/optimization-2026-09-15.md`。
