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

2026-09-22 已完成 Docker 镜像构建与临时目录容器启动验证：迁移、`/health`、静态首页均通过，进程 UID 为 10001；未挂载或修改业务数据卷。

## 数据库迁移

启动自动执行 `app.db.migrations.migrate_database`：

1. 空库执行迁移 `0001` 至 `0005`；包含完整工作区、审批状态、原始日期与改期历史，并迁移 CVS CR 至 Development。
2. 对旧 Phase-1 自动建表但没有 `alembic_version` 的数据库，先比较实际结构；一致才登记基线，再升级。
3. 结构不一致时拒绝自动登记，保留原数据供人工审查。

后续新增迁移在开发库使用 `uv run alembic revision --autogenerate -m "..."`，审查生成代码并验证升级后再交付。不要直接对现有数据运行 `create_all` 来代替迁移。增量迁移增加状态/日期历史字段，并将已有标准 CVS CR 动作归入 Development。工作区首次加载时升级四阶段与双日期字段，正常保存为新版本；旧阶段动作保留在 `retiredActions`。

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

## 浏览器来源与恢复校验（2026-09-22）

默认 `CORS_ORIGINS=[]`，页面与 API 同源工作。开发代理显式保留 Host；若反向代理改写 Host，应保留外部 Host 或将准确的页面来源加入 `CORS_ORIGINS`（JSON 数组，例如 `["https://tooling.example.internal"]`）。通配符不授予外站访问权限。来源检查不替代认证：目前选人和 Admin 按钮仍是无账号的协作模式，不能作为服务器权限隔离。

请求体（含分块传输）解析前限制为 12 MB，工作区本体及 Excel 文件仍限制 10 MB。加载 JSON 前先只读校验；校验失败不替换页面数据。生产环境仍由用户按既定方式部署。

## 本次版本从 Git 更新到 Linux 服务器（2026-09-22）

本次 Git 同时携带代码和已按新规则处理的 `backend/tooling.db`：52 个项目（46 个导入 + 6 个其他），导入项目完成动作 198→5、193 项重新开放。以下默认服务器通过 `scripts/start.sh` / Uvicorn 运行，使用默认数据库路径。若设置了 `DATABASE_URL`，应先按实际路径备份，不能直接套用默认路径。

### 更新已有部署

1. 进入服务器现有仓库根目录，先用原来的进程管理方式停止该项目。不要停止其他应用。数据库会更新为本次 Git 中的版本，服务器上尚未同步回来的新编辑保存在本步骤的备份里；需要保留这些新编辑时，应先核对合并，不直接覆盖。
2. 备份 SQLite（包括已提交 WAL），保存现有数据库及伴随文件，然后拉取。数据库由 Git 跟踪，正常使用也会产生本地修改；以下 restore 只针对已备份的数据库，不清理其他代码改动。

```bash
# 在项目根目录执行；先完成上文停服步骤。
set -e
trw_backup_dir="$PWD/backups/before-update-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$trw_backup_dir"
backend/.venv/bin/python scripts/backup-sqlite.py backend/tooling.db "$trw_backup_dir/snapshot.db"
git status --short
for trw_file in backend/tooling.db backend/tooling.db-wal backend/tooling.db-shm; do
  if [ -f "$trw_file" ]; then mv "$trw_file" "$trw_backup_dir/"; fi
done
git restore --source=HEAD --worktree -- backend/tooling.db
git pull --ff-only origin main
TOOLING_HOST=0.0.0.0 TOOLING_PORT=8000 ./scripts/start.sh
```

如果还有其他文件本地修改导致 pull 拒绝，先保存并处理这些改动，不要使用 `reset --hard`。上面的启动命令在前台运行；正式服务继续使用已有 systemd / Supervisor 配置管理，并在服务环境中设置监听地址及端口。迁移自动执行到 0005，无须手工运行数据库建表命令。

3. 另开终端检查：

```bash
curl -fsS http://127.0.0.1:8000/health
```

浏览器访问 `http://服务器IP:8000`，刷新旧页面，确认 Portfolio 共 52 个项目、四步流程、CVS CR 位于 Development，抽查历史导入动作已按新规则重新开放。反向代理部署仍按本文件的 Host/CORS 配置保留同源访问。

### 首次部署

服务器需要 Python 3.11+、uv、Node.js 22.12+、Bun，且 SSH 密钥有该私有仓库读取权限。在选定安装目录执行：

```bash
git clone git@github.com:Chenxin-hub1/tooling-replacement-workflow.git
cd tooling-replacement-workflow
TOOLING_HOST=0.0.0.0 TOOLING_PORT=8000 ./scripts/start.sh
```

数据随仓库到达，启动后执行同样的健康检查和页面核对。

### Docker 数据区别

当前 Dockerfile 不复制数据库，`.dockerignore` 排除了 `*.db*`；`tooling-data` 卷独立持久化。只执行 `docker compose up --build -d` 会沿用卷内旧数据，新空卷首次打开只会生成 6 个示例，不会自动加载 Git 内这次更新的 52 个项目。使用 Docker 的服务器需要在停服并备份卷内数据库后，显式把本次仓库数据库导入 `/data/tooling.db`，保留 UID 10001 的写权限，再启动；不要用删除整个数据卷代替数据更新。

## Docker Compose 更新现有服务器

用户已确认服务器使用 Docker Compose。以下按仓库现有服务名 `tooling`、数据库 `/data/tooling.db` 和命名卷配置执行；如果服务器覆盖了数据库路径，须对应调整。主机只需 Git、Docker 与 Compose，Python/Node/Bun 都在镜像构建及运行环境中。

本次把仓库内已重新核验的 52 项目数据库装入数据卷。服务器当前数据会完整备份；若服务器另有需要合并的新编辑，先核对这些编辑再执行数据库替换。后续只更新代码时，省略数据库安装步骤即可保留卷内当前数据。

在服务器**现有仓库目录**按顺序运行（沿用原 Compose 项目名；原先使用过 `-p`/`-f` 或环境文件时继续使用相同参数）：

```bash
set -e
git pull --ff-only origin main
# 构建成功后再停服，构建失败不会中断当前服务。
docker compose build tooling
docker compose stop tooling

# 将发布数据库及安装脚本只读挂载进临时容器。
# 安装过程：验证发布数据 → 暂存并迁移 → 完整备份旧库 → 替换。
docker compose run --rm --no-deps -T \
  --entrypoint python -e PYTHONPATH=/app/backend \
  -v "$PWD/backend/tooling.db:/release/tooling.db:ro" \
  -v "$PWD/scripts/install-workspace-db.py:/ops/install-workspace-db.py:ro" \
  tooling /ops/install-workspace-db.py /release/tooling.db /data/tooling.db

docker compose up -d --wait tooling
docker compose ps
docker compose logs --tail=50 tooling
curl -fsS http://127.0.0.1:8000/health
```

安装脚本会输出备份位置（`/data/backups/deploy-...`）和项目统计；旧数据库、WAL、SHM 均保留，备份不覆盖。新数据库在临时文件上完成迁移/校验后才替换，运行用户仍为 UID 10001。安装后的 workspace revision 高于旧卷及发布库版本，旧浏览器页面无法带着旧 revision 覆盖新数据。遇到错误先保留输出处理原因，不跳过失败步骤继续启动。

`--wait` 等待容器健康；较旧 Compose 若不支持，应升级 Compose，或使用 `up -d` 后自行确认 health。正常应看到 `healthy`，浏览器访问 `http://服务器IP:8000` 并刷新页面。数据核对：52 项目、46 个历史导入项目、导入项目 5 项完成；其余 193 项按新规则重新开放。端口如被服务器覆盖，以实际映射为准。

可从容器内核验，不依赖主机 Python：

```bash
docker compose exec -T tooling python -c 'import json,urllib.request; w=json.load(urllib.request.urlopen("http://127.0.0.1:8000/api/workspace")); p=w["snapshot"]["projects"]; i=[x for x in p if x.get("importSource")]; print({"revision":w["revision"],"projects":len(p),"imported":len(i),"imported_completed":sum(bool(a.get("done")) for x in i for a in x["actions"])})'
```

备份保存在命名卷内，可另行复制到主机：

```bash
mkdir -p backups/compose
docker compose cp tooling:/data/backups backups/compose/
```

需要恢复数据时，先停服，使用同一个安装脚本将备份目录中的 `snapshot.db` 作为 source、`/data/tooling.db` 作为 target，再启动；恢复同样产生新备份及更高版本号。不要运行 `docker compose down -v`，该命令会删除持久卷及卷内备份。
