# Phase-4：Excel、工作区保存与本机发布

Status: in-progress

## 唯一实现基准

[tooling-replacement-workflow_3459.html](../.design/reference/tooling-replacement-workflow_3459.html)。2026-09-15 用户明确要求 UI 和功能完全一致，不得独立设计。

## 范围

沿用原样板 Excel 模板与首表导入，Portfolio/Status/Actions/Teams 导出，以及 JSON 工作区下载/加载。新增 GET/PUT /api/workspace 与 SQLite workspaces 表、revision 并发校验。原样板与本地资源随 Git 分发，由 FastAPI 托管 Vite 构建。用户先在本机验证，之后自行从 Git 拉取到服务器。

仅允许服务器接入必需的资源路径、初始化顺序、保存说明与失败提示差异。样板固定日期、提醒预览和人员切换行为保留。

## 验证

原始样板与发布页面同浏览器截图比对（仅统一保存说明，容许最多 5 个抗锯齿像素差异），并执行浏览器持久化与 Excel 测试。完整证据见 `handoff-tooling-replacement-workflow.md`。

## 真实数据接入前置条件

用户提供真实 Excel，功能全部完成后才可导入。目前只读核对发现占位值会被样板误标完成，以及列名、混合日期、责任人和项目标识歧义。详见 `docs/real-data-readiness.md`；这些未解决前保持演示数据，不宣称 Phase-4 完成。

## 用户批准的优化（覆盖前述原样板保留边界）

本轮已授权实时日期/状态校验、Excel 预览与来源保留、保存可靠性、手机端优化；通知改为明确预览，登录暂不启用。以 `docs/optimization-2026-09-15.md` 为当前行为记录。真实文件歧义待核对，不导入。
