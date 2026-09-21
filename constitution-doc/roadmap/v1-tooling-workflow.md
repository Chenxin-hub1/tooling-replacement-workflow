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

2026-09-21 加固（P0）：`PUT /api/workspace` 真实变更后自动落工作区 JSON 快照（滚动保留 50 份，目录跟随数据库，恢复方式见 `docs/deployment.md`）；样板渲染的全部数据插值由 `prepare-prototype.mjs` 在生成时包上 `escHtml`/`escJs` 转义并逐条断言出现次数，e2e 增加转义回归用例。快照与转义均有测试覆盖。已知：e2e 时间线标签用例在本机环境偶发失败，旧代码同样复现，与本次改动无关（当日第二轮已查明根因并修复，见下）。

2026-09-21 加固（第二轮，外部报告核实后修复）：外部代码分析报告 6 条，核实后 2 条属实并修复。其一，保存冲突（409/422）后 `serverConflict` 无重置通道，只能刷新页面恢复；现 Admin 载入工作区文件或重置演示数据会重取最新版本号解锁并立即保存（`workspace.js` 的 `recoverAndSave`，载入经 `improvements.js` 一次性挂钩 `restore` 实现，不修改生成的 `prototype.js`）。其二，未保存备份键按标签页隔离，其他标签页异常关闭留下的孤儿键在 Admin 不可见也无法清理；现 Admin 集中列出全部本地备份（含孤儿，可下载/删除），页面加载时自动淘汰超过 14 天或超出 3 份的孤儿，备份写入遇配额不足先清孤儿再重试。e2e 新增 3 例覆盖。其余 4 条不修：`python:3.12-slim` 实测自带 tzdata 且 `TZ=Asia/Taipei` 生效（当前部署亦不经 Docker）；`write_snapshot` 自引入起即在线程池执行；CORS 通配符与凭据并存属实但同源无凭据，留作低优先级卫生项；399 条灰色提示按 `docs/real-data-readiness.md` 既定流程等业务答复后重导同文件即可，无需新向导。

2026-09-21 时间线标签用例根因修复（外部反馈核实）：`layoutTimeline()` 原为单遍处理——全部标签矩形在贴边内收**前**一次性测量并据此分层，内收却在分层**后**移动标签水平位置，位移不参与碰撞判定；右侧 100% 标签被 `right:7px` 内收后可左移半个字宽，与同层标签叠字。修复为两阶段：先贴边内收到最终位置，再重新测量并分层。验证：修复前当日 5/5 失败（含干净 HEAD 两次），修复后单用例 5/5、全套 16/16 通过。另注：像素对比用例阈值仅 5 像素，本机偶有抗锯齿噪声超限（portfolio 差 7 像素后复跑 3/3 通过），与布局改动无关，后续如再现可考虑放宽阈值或加字体就绪等待。
