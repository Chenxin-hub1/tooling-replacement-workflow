# v1 — Tooling Replacement Workflow MVP

## Charter
构建并交付 Tooling Replacement Workflow 的完整可用全栈系统，实现标准 6 阶段工作流协同、多维看板展示及 Excel 双向集成能力，确保系统验证完毕后能够直接加载生产数据投入使用。

## Acceptance
1. 后端 FastAPI 服务启动正常，具备项目、团队、阶段动作流转的完整 API；
2. 6 阶段状态自动计算引擎（依赖推导、交期 Lead time、到期日与红黄绿状态判定）逻辑完备；
3. 前端界面完整覆盖：Portfolio 仪表盘（含 6 段微型进度条 `rail6`）、Project 详情与阶段操作流、My Actions、Management 看板、新建项目向导；
4. Excel 双向接口打通：可导入结构化表并自动对齐字段与状态，可导出多 Sheet 报表。

## Phase-1: Data Foundation & Scheduling Engine
Status: `closed`
Description: 搭建后端 FastAPI + SQLite 骨架，实现数据模型（Project, Action, TeamMember）、标准 6 阶段动作矩阵（Matrix）以及前置依赖与状态调度计算引擎。
Spec: specs/phase-1-data-foundation.md

## Phase-2: Frontend Shell & Multi-View Dashboards
Status: `awaiting-acceptance`
Description: 直接沿用指定 HTML 样板，实现相同 Shell、Portfolio 表格与筛选、Management、My Actions、Reminders 和 Admin，不采用独立设计。
Spec: specs/phase-2-frontend-dashboard.md

## Phase-3: Project Details, Action Execution & Wizard
Status: `awaiting-acceptance`
Description: 实现项目详情页完整交互（主数据编辑、团队分配、动作输入/完成弹窗、调整交期与备注）以及 3 步新建项目向导（Wizard）。
Spec: specs/phase-3-project-detail-workflow.md

## Phase-4: Bidirectional Excel Integration & Real-Data Readiness
Status: `in-progress`
Description: 实现 Excel 导入解析与导出引擎（智能列名对齐、值回填），进行全流程端到端联调测试，完成真实数据导入前的验收封版。
Spec: specs/phase-4-excel-integration.md

## 样板对齐（2026-09-15）

用户明确要求 UI 与功能完全遵循 [原始样板](../../.design/reference/tooling-replacement-workflow_3459.html)，禁止独立设计。Phase-2–4 重新进入实施，旧版独立 React 页面退出发布入口。直接保留原始 HTML/CSS/交互，增加服务器工作区持久化与并发版本校验。标准矩阵已核实样板也是 31 项；原始业务 Excel 后续核对。

样板固定 Today 为 2026-09-12，邮件/Teams 为预览，身份切换为原型选人；本次不擅自改变这些行为。用户要求先完成本机，之后自行从 Git 拉取部署；目前禁止上传 Git。Docker 配置有待可用环境构建验证。

样板对齐已通过 74 项 Python 测试和 5 条 Playwright 流程，本机预览已更新。真实 Excel 已收到，仅只读核对：46 条记录、41 列；占位值、混合日期与列名映射未解决前不导入。Phase-4 保持 in-progress，详见 `docs/real-data-readiness.md`。

## 已授权的优化

用户同意保持桌面样板风格，优化真实导入、实时日期/状态、保存可靠性、移动端操作和身份权限。邮件/Teams 暂不确定是否启用真实发送，本轮保留预览并消除已发送误导，不接通外部通知。真实数据仍须全部功能验证后导入；暂不上传 Git。

优化实现完成：实际日期、状态/依赖校验、预览文案、导入预览、幂等保存与未保存备份、移动端。用户确认本轮不启用登录、通知不发送；真实文件歧义保留待核对，不正式导入。当前权威行为见 `docs/optimization-2026-09-15.md`，覆盖前述样板固定日期等历史记录。Phase-2/3 等待优化验收，Phase-4 因真实业务歧义继续进行中。
