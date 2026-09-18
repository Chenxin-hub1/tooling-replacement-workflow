# Tooling Replacement Workflow 后端

> 当前样板页面使用 `GET/PUT /api/workspace` 和 SQLite `workspaces` 表保存完整状态，revision 防止覆盖。下文项目/Excel API 为历史实现接口，不与当前 UI 混用。详见根目录交接记录。

FastAPI + SQLAlchemy 2.0 异步会话 + SQLite，覆盖项目、团队、动作排期、KPI 与 Excel 双向接口，并在生产模式托管前端。

## 安装与启动

在项目根目录执行（需要 Python 3.11+ 和 uv）：

```bash
cd backend
uv sync --locked --extra dev
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

接口文档：<http://127.0.0.1:8000/docs>；OpenAPI：<http://127.0.0.1:8000/api/openapi.json>。

默认数据库为启动工作目录中的 `tooling.db`，因此请在 `backend/` 下启动。启动时执行 Alembic 迁移；旧版无版本号数据库先验证结构再接入迁移基线。SQLite 启用 WAL、外键和 10 秒写锁等待。

可复制 `.env.example` 为 `.env`。`DATABASE_URL` 支持覆盖连接地址；日期按服务器本地时区计算。`updated_at` 保存 UTC 时间（SQLite 中不带时区）。数据库文件与 `.env` 已列入根目录 `.gitignore`。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 实际执行数据库查询，连接不可用时返回 503 |
| POST | `/api/projects` | 创建项目、团队和 31 个标准动作，返回 201 |
| GET | `/api/projects` | 列表；支持 `plant`、`bu`、`status` 精确筛选 |
| GET | `/api/projects/{id}` | 主数据、团队、动作、直接前置动作和阶段汇总 |
| PATCH | `/api/projects/{id}` | 修改主数据、按角色合并团队并转派未完成动作 |
| PATCH | `/api/projects/{id}/actions/{action_id}` | 更新动作值、完成日期、交期、目标日、备注和链接 |
| POST | `/api/projects/{id}/actions` | 新增自定义动作，返回 201 |
| DELETE | `/api/projects/{id}/actions/{action_id}` | 删除无后继依赖的自定义动作，返回 204 |
| GET | `/api/kpi/summary` | 项目总数、阶段分布、逾期角色/人员/项目分布 |
| GET | `/api/actions` | 跨项目动作列表，支持 owner 和 status 筛选 |
| POST | `/api/excel/preview` | 上传并验证工作簿，不写库 |
| POST | `/api/excel/import` | 重新验证并原子导入，mode=create/upsert |
| GET | `/api/excel/export` | 导出全部或 project_id 指定的单个项目 |
| GET | `/api/excel/template` | 下载空白标准工作簿 |

创建示例，可粘贴到 `/docs` 的 `POST /api/projects`：

```json
{
  "pn": "PN-001",
  "desc": "Tooling replacement pilot",
  "plant": "Changchun",
  "bu": "Airbag",
  "team": {"BU Buyer": "Buyer A", "SDE": "Engineer A"}
}
```

未提供 `id` 时生成 `TR-当前年-序号`；可提供最多 60 字符的业务 ID（英文字母、数字、下划线和连字符，首字符为字母或数字）。SQLite 写操作在读取状态前取得写锁，避免并发编号与团队更新冲突。项目创建及关联记录在同一事务提交。

## 接口语义

- **动作基线**：2026-09-15 用户确认先保留现有 31 项；原始业务矩阵待核对，不代表 31 项已经业务验收。阶段编号仍是 0–5，标准动作分布为 0、9、7、4、5、6。
- **阶段状态**：`summary.phase_statuses` 返回 `completed / overdue / in-progress / planned`；`summary.phase_health` 返回颜色；`summary.phases` 提供各阶段计数。全部完成优先，其次逾期；已有完成动作或非空填报值视为进行中。未填报的临期动作可同时呈现 `planned` 和黄色。
- **立项阶段**：没有动作时视为完成；新增阶段 0 自定义动作后，按实际动作计算。
- **健康度筛选**：`status=green|red|yellow|gray` 表示项目健康颜色。到期当天至到期前 5 天为黄色，超过到期日为红色。未排期动作为灰色；完成动作为绿色。
- **排期**：按依赖拓扑计算，不依赖数组或数据库排序。前置完成日优先于前置目标日，再回退到立项日。循环、缺失或重复依赖图会被拒绝。完成、取消完成、调整交期或手动日期均重新排期。
- **手动目标日**：仅在 `lead=null` 时生效。要把自动排期改为手动排期，PATCH 同时提交 `{"lead": null, "due_date": "2026-10-01"}`；只清空 `lead` 会保留现有目标日。`value` 是填报内容，不会自动转成目标日。
- **PATCH**：省略字段表示保留原值。可空字段显式传 `null` 表示清空；`pn`、`desc` 和团队字典不可传 `null`。团队字典按角色合并，空字典不删除已有成员。改派保留已完成动作的历史负责人。
- **自定义动作**：`ph` 为 0–5 整数、`lead` 为 0–36500 整数，角色限六类。依赖必须属于当前项目。标准动作或仍被依赖的动作不可删除（409）；不存在或不属于当前项目的资源返回 404；非法输入返回 422。
- **KPI**：项目按首个未完成动作所在阶段归类；所有动作完成的项目计入阶段 5，同时计入 `completed_projects`。红旗按逾期天数从多到少排列。

## 验证

```bash
uv run pytest -q -W error
uv run ruff check app tests migrations
uv run ruff format --check app tests migrations
uv run ty check app tests
```

测试逐项创建独立临时 SQLite，使用相同建表与连接配置，不写入 `backend/tooling.db`。覆盖实际 HTTP API、持久化、并发编号、完成/取消完成排期、团队转派、自定义动作、错误回滚、状态边界及健康检查。

## 当前边界

前端与 Excel 接口已实现，真实业务矩阵和原始工作簿仍待核对。启动与迁移见 `../docs/deployment.md`；Excel 格式见 `../docs/excel.md`。当前为本地/受控局域网工作区，尚无身份认证与角色权限隔离。
