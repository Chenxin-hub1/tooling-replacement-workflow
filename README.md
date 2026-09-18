# Tooling Replacement Workflow

桌面基于用户提供的 `tooling-replacement-workflow_3459.html` 样板，保留布局与风格。已按用户授权优化日期/状态、导入预览、保存可靠性和移动端；服务器负责完整工作区持久化。

## 本机启动与后续服务器部署

需要 Python 3.11+、uv、Node.js 22.12+、Bun。根目录执行：

```bash
./scripts/start.sh
```

访问 <http://localhost:8000>。首次安装锁定依赖、生成并构建样板页面，自动迁移数据库。默认数据库为 `backend/tooling.db`。端口由 `TOOLING_PORT` 指定。

用户当前要求先在本机完成，之后自行从 Git 拉取到服务器。服务器拉取后同样执行上述命令；局域网监听可设置 `TOOLING_HOST=0.0.0.0`。无需 Windows 原始路径，样板和字体、Excel 库都包含在仓库内。详细配置见 [部署说明](docs/deployment.md)。

## 样板及发布入口

- [原始样板](.design/reference/tooling-replacement-workflow_3459.html) 为只读比对基准。
- `frontend/scripts/prepare-prototype.mjs` 从样板生成入口，保留原 CSS、DOM 与交互函数。
- `frontend/public/workspace.js` 适配服务器保存；`GET/PUT /api/workspace` 是页面唯一业务数据接口。
- 旧 React 页面与规范化项目 API 暂存为历史实现，不参与当前样板页面的数据流。

## 原样保留的功能

Portfolio、My actions、Management、Reminders、Admin · People & functions、项目详情、三步新建向导、动作填写/完成/重开、调整交期、团队转派、自定义动作与模板追加、项目删除、Excel 导入导出、工作区 JSON 下载/加载。

标准模板为 31 项，与用户批准的基线一致。首次访问空工作区显示样板自带的 6 个示例项目。完整工作区保存至 SQLite `workspaces` 表，刷新或换浏览器可读取；两个页面同时编辑时，旧版本写入被拒绝，页面提示先下载工作区文件保留修改再刷新。

## 当前边界

Today 已改为实际日期。邮件/Teams 仅预览、不会真实发送；按用户要求暂不启用登录账号。真实数据的歧义保留待核对，缺少创建日期时不导入。详见 [已授权优化](docs/optimization-2026-09-15.md)。

## 验证

```bash
cd frontend
bun install --frozen-lockfile
bunx playwright install chromium
cd ..
./scripts/check.sh
```

浏览器测试将原始样板与发布页面使用同一浏览器、字体和数据截图比较，并覆盖跨浏览器保存、版本冲突及原样板 Excel。比较时统一两处保存说明，允许最多 5 个抗锯齿像素差异。测试数据库与本机业务数据库隔离。

- [样板对齐与交接](handoff-tooling-replacement-workflow.md)
- [Excel 使用说明](docs/excel.md)
- [当前路线图](constitution-doc/roadmap/v1-tooling-workflow.md)

真实 Excel 已于 2026-09-18 按领导指示正式导入（46 条，创建日期统一导入当日；备份与核对记录见 [接入前核对](docs/real-data-readiness.md)）；BPW / CVS CR 等歧义映射仍待业务确认，确认后重导即按身份更新。本机服务：<http://localhost:8765>（8000 端口被其他应用占用）。仓库已于 2026-09-18 推送至 GitHub（Chenxin-hub1/tooling-replacement-workflow，Private）；按用户决定，业务数据库 `backend/tooling.db` 随仓库分发，Git 是代码与数据的单一部署通道。
