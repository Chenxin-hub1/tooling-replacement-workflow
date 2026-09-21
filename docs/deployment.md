# 运行、部署与备份

## 开发模式

终端一：

```bash
cd backend
uv sync --locked --extra dev
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

终端二：

```bash
cd frontend
bun install --frozen-lockfile
bun run dev
```

访问 <http://localhost:5173>，Vite 将 `/api`、`/health` 代理到后端。`API_PROXY_TARGET` 可覆盖后端地址。

## 本地生产模式

根目录 `./scripts/start.sh` 会构建前端，并由一个 Uvicorn 服务提供前端、API 和数据库迁移。页面深链接可直接刷新，缺失 API 或静态资源不会错误返回前端 HTML。

- `TOOLING_HOST` 默认 `127.0.0.1`，`TOOLING_PORT` 默认 `8000`。
- `DATABASE_URL` 默认 `sqlite+aiosqlite:///./tooling.db`，相对于 `backend/` 启动目录。
- 用户已授权 Today 使用浏览器的实际本地日历日期并跨天刷新。建议所有操作人员使用一致的业务时区。
- SQLite 写操作串行处理，配置 WAL、外键、10 秒锁等待。以单应用进程运行本地/小型受控局域网工作区；未来多实例部署需要单独验证数据库和并发方案。

## Docker Compose

```bash
docker compose up --build -d
docker compose logs -f tooling
```

访问 <http://localhost:8000>。镜像使用多阶段构建与非 root 运行用户，数据库保存在 `tooling-data` 卷，健康检查使用 `/health`。`docker compose down` 保留卷；不要在保留数据的场景使用 `down -v`。

本环境没有 Docker，Dockerfile/Compose 仅完成配置编写，未完成镜像构建和容器启动验证。当前验证覆盖等价的本地生产构建与真实 HTTP/浏览器运行。

## 数据库迁移

启动自动执行 `app.db.migrations.migrate_database`：

1. 空库执行迁移 `0001` 和 `0002`；新增 `workspaces` 表保存完整样板状态。
2. 对旧 Phase-1 自动建表但没有 `alembic_version` 的数据库，先比较实际结构；一致才登记基线，再升级。
3. 结构不一致时拒绝自动登记，保留原数据供人工审查。

后续新增迁移在开发库使用 `uv run alembic revision --autogenerate -m "..."`，审查生成代码并验证升级后再交付。不要直接对现有数据运行 `create_all` 来代替迁移。当前结构没有修改历史字段，也没有迁移业务内容。

## 备份与恢复

根目录执行（目的文件必须不存在）：

```bash
backend/.venv/bin/python scripts/backup-sqlite.py backend/tooling.db backups/tooling-2026-09-15.db
```

脚本调用 SQLite 在线备份 API，会包含 WAL 中已提交的数据；不要仅复制活跃的 `.db` 而漏掉 WAL。

恢复步骤：停止服务，将当前 `.db`、`-wal`、`-shm` 文件整体移到独立保留目录，将备份复制到原数据库路径，再启动服务并检查项目数及健康状态。不要把旧 WAL 文件留在恢复后的数据库旁边。

### 工作区自动快照（2026-09-21）

`PUT /api/workspace` 每次真实变更保存成功后，服务端自动把整份工作区 JSON 写入快照目录，滚动保留最近 50 份：

- 目录默认跟随数据库文件：`<数据库目录>/backups/workspace`（本机即 `backend/backups/workspace`，Docker 为 `/data/backups/workspace`，随数据卷持久化）；可用环境变量 `SNAPSHOT_DIR` 覆盖。该目录已在 `.gitignore` 忽略，不随仓库分发。
- 文件名 `workspace-<UTC 时间戳>-r<版本号>.json`，内容与「Admin · Save workspace file」导出的工作区文件一致。
- 幂等重试（内容未变）与 409 冲突不产生快照；快照写入失败只记告警，不影响保存结果。
- 恢复：在「Admin · Load workspace file」直接上传某个快照 JSON（走正常保存链路，产生新版本与新快照），或 `GET /api/workspace` 取得当前 revision 后 `PUT` 回快照内容。

本轮已在独立演示库验证备份，并比对备份中的 6 项项目数据；未对用户原库执行恢复。

## 当前页面的数据来源

UI 使用 `GET/PUT /api/workspace`，SQLite `workspaces` 行保存所有项目、人员职能、可编辑模板和规则，revision 递增。旧 `projects`、`project_actions`、`team_members` 表保持原状，但不与样板工作区混用；不要通过旧项目 API 编辑当前页面数据。首次打开无工作区的数据库时，载入样板原有 6 个示例项目。

## 用户的发布方式

先在当前电脑完成；之后由用户在服务器从 Git 拉取代码。拉取后执行 `./scripts/start.sh`，或在安装了 Docker 的服务器执行 `docker compose up --build -d`。`.design/reference/` 必须纳入 Git 和 Docker 构建上下文，运行时无需访问用户的 Windows 桌面。更新前用 SQLite 备份脚本备份工作区数据库，再停止旧进程、拉取、重新启动。

2026-09-18 更新：仓库已推送至 `git@github.com:Chenxin-hub1/tooling-replacement-workflow.git`（Private，main 分支）。按用户决定，业务数据库 `backend/tooling.db` **随仓库提交**——Git 是代码与数据的单一部署通道；`.demo/`、`.playwright-mcp/` 与 WAL/SHM 临时文件仍被忽略。提交数据库前必须先合并 WAL（`PRAGMA wal_checkpoint(TRUNCATE)`，或停服后提交），否则提交到的是旧数据。服务器更新流程：备份数据库 → 停止旧进程 → `git pull` → 重新启动 `./scripts/start.sh`（局域网访问设 `TOOLING_HOST=0.0.0.0`）。

## 当前服务范围

保留样板的人员选择与前端管理按钮规则，没有新增认证。提醒页面与手动提醒仍为样板预览，不会向 Outlook / Teams 发消息。当前运行于本机；真实服务器由用户后续自行部署。
