# Mission

## Background
在汽车安全系统（ZF LIFETEC）业务场景中，模具更换（Tooling Replacement / Capacity / VAVE / 模具磨损）是一个涉及跨多个职能（BU Buyer, SDE, PM, ENG, SP/BU, Accounting）的长周期协同过程。
目前高度依赖离线 Excel（Master Changes and OIL 表）进行手动跟踪，面临以下痛点：
1. 状态与卡点不透明：各职能难以实时掌握模具所处阶段与前置条件；
2. 进度预警缺失：缺乏针对交期（Lead Time）与关键里程碑（FOT, PPAP, BPW, SOP）的逾期预警与协同机制；
3. 旧模处置闭环断裂：从新模验证到旧模报废（SCR/TDA）流转不够紧密。

## Target Audience
- **BU Buyer（业务采购 / 发起人）**：快速立项、组建跨职能团队、把控项目全生命周期与 SOP 投产节点。
- **SDE / ENG / PM / SP/BU / Accounting（跨职能执行团队）**：按职能清晰掌握自己的待办任务，录入交付物、审批意见与关键日期。
- **Management / Lead（管理层）**：全局 Portfolio 看板、卡点瓶颈分析（按职能/人员/阶段透视逾期）与红旗预警。

## Solution
打造一套现代化的 **Tooling Replacement Workflow（模具更换工作流全栈管理系统）**：
- 固化标准 6 阶段流水线（立项 -> 开发制造 -> 内部审批 -> 客户审批 -> 报废处置 -> 归档）与前置依赖网络；
- 提供组合看板（Portfolio）、项目详情（Project）、个人待办（My Actions）、管理看板（Management View）及新建向导（Wizard）；
- 具备数据库持久化与 Excel 双向无缝互通能力。

## Goals
- **GOAL_1**: 完整支撑 6 阶段全生命周期与 6 类跨职能角色的协同任务闭环。
- **GOAL_2**: 提供直观、美观且高效的多视图看板（还原高保真原型交互体验）。
- **GOAL_3**: 数据库与 Excel 深度协同，支持复杂格式 Excel 的精准导入映射与标准格式多 Sheet 导出。

## Versions
| Version | Status |
| --- | --- |
| [v1-tooling-workflow](roadmap/v1-tooling-workflow.md) | `in-progress` |
