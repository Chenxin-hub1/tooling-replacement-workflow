# 03: 项目管理与工作流 REST API 接口 (REST API Endpoints)

**What to build:**
提供完备的 FastAPI RESTful API 路由，支持模具项目的创建、查询和更新（本阶段未定义项目删除接口）、动作执行（填报值、完成/取消、调整交期、备注）、自定义动作增删以及全局组合 KPI 指标统计。

**Blocked by:** 02: 标准 6 阶段动作矩阵与调度计算引擎 (Standard Matrix & Scheduling Engine)

**Status:** closed
**Type:** task

- [x] `POST /api/projects`: 支持传入主数据和团队成员，自动生成项目并派生初始动作网络。
- [x] `GET /api/projects`: 支持查询项目列表，返回带阶段聚合状态、整体健康度与进度百分比的摘要数据，支持工厂/BU/状态过滤。
- [x] `GET /api/projects/{id}`: 支持查询单个项目完整详情，包含所有团队成员、阶段动作及前置依赖链。
- [x] `PATCH /api/projects/{id}`: 支持修改主数据或团队成员，自动触发未完成动作的转派。
- [x] `PATCH /api/projects/{id}/actions/{action_id}`: 支持修改动作录入值、完成状态、交期调整及备注，自动刷新依赖排期。
- [x] `POST /api/projects/{id}/actions`: 支持在指定阶段插入自定义动作。
- [x] `DELETE /api/projects/{id}/actions/{action_id}`: 支持删除自定义动作。
- [x] `GET /api/kpi/summary`: 提供全局卡点分析（逾期动作按角色/项目分布、项目阶段漏斗等）。


## 实现记录（2026-09-15）

已实现并运行回归与 API 集成验证，详见 `backend/README.md` 和根目录交接记录。当前尚无 Git 提交，因此没有可引用的提交哈希；状态保留待验收，不自动关闭。

2026-09-15 用户确认继续完成整个项目，Phase-1 已验收。
