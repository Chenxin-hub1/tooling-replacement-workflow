# Spec: Phase-1 Data Foundation & Scheduling Engine

**Status:** `closed`  
**Phase:** Phase-1 (from `constitution-doc/roadmap/v1-tooling-workflow.md`)  
**Scope:** 后端 FastAPI 项目架构、SQLite 数据库模型、标准 6 阶段动作矩阵（Matrix）、前置依赖与交期状态调度计算引擎、核心 REST API 与单元测试。

---

## 1. 目标与背景 (Context & Goals)

本项目旨在为模具更换全生命周期协同提供坚实的数据持久化与工作流计算核心。Phase-1 专注于后端服务，不涉及前端 UI。
完成后，后端能够：
1. 完整维护模具项目（Project）主数据与跨职能团队指派；
2. 依据当前开发基线的标准流程矩阵（31 项标准动作），在项目立项后自动实例化阶段任务网络；
3. 准确执行基于前置依赖（Predecessor）与交期（Lead Time）的到期日推导和健康度判定（红黄绿状态）；
4. 提供规范的 RESTful API，供后续前端多视图看板与 Excel 导入导出调用；
5. 提供自动化测试用例，验证核心业务路径与已知边界，测试结果不等于穷尽所有业务情形。

---

## 2. 领域模型与数据库设计 (Domain Models)

采用 SQLAlchemy 2.0 Declarative `Mapped[]` 异步模型，SQLite 作为底层持久化。

### 2.1 `Project` (模具项目主表)
- `id` (String, 主键): 业务项目唯一编号，如 `TR-2026-030`。
- `pn` (String, 非空): 零件号 (Part Number)。
- `desc` (String, 非空): 零件描述 (Part Description)。
- `plant` (String): 涉及工厂 (Plant affected，如 Aschau, Changchun 等)。
- `reason` (String): 更换原因 (Reason，如 Current supplier worn out, Tool transfer 等)。
- `cur` (String): 当前/旧供应商 (Old / Current Supplier)。
- `nw` (String): 新供应商 (New Supplier)。
- `po` (String): 模具采购订单号 (Tool PO)。
- `tag` (String): 模具资产编号 (Tool Tag)。
- `too_owner` (String): 模具归属权 (Tool Owner)。
- `cav` (String): 模具模穴数 (Cavities)。
- `saving` (String): 预计年度节省金额 (Estimated saving €/yr)。
- `oem` (String): 主机厂客户 (OEM)。
- `tech` (String): 工艺技术 (Technology)。
- `bu` (String): 业务单元 (Business Unit，如 Airbag, Steering Wheel, Seatbelt)。
- `owner` (String): 项目主负责人 (通常为 BU Buyer)。
- `created_at` (Date, 默认当天): 项目创建/立项日期。
- `updated_at` (DateTime): 最近更新时间。

### 2.2 `TeamMember` (项目团队角色表)
- `id` (Integer, 主键自增)
- `project_id` (String, 外键关联 `projects.id`)
- `function` (String, 非空): 跨职能角色（`BU Buyer`, `SDE`, `PM`, `ENG`, `SP/BU`, `Accounting`）。
- `name` (String, 非空): 责任人姓名。
- `email` (String): 邮箱（ZF LIFETEC 统一命名规则）。

### 2.3 `ProjectAction` (阶段任务动作表)
- `id` (String, 主键): 如 `TR-2026-030-0`。
- `project_id` (String, 外键关联 `projects.id`)。
- `ph` (Integer, 0-5): 对应 6 大阶段（0: Tool Creation, 1: Development, 2: Internal Approval, 3: Customer Approval, 4: Scrap, 5: Archive）。
- `tab` (String): 分组/动作标识（如 `CR`, `FOT Date`, `PPAP Status`, `Core BPW` 等）。
- `act` (String): 动作操作描述。
- `input_type` (String): 要求的录入类型/格式（如 `Date`, `CR number`, `External / Internal`, `Scrap / Return / Storage`）。
- `fn` (String): 负责该动作的标准角色（Function）。
- `owner` (String): 实际执行人姓名（初始化时继承项目团队中该 `fn` 角色的人员）。
- `dep_id` (String, 可空): 前置依赖动作 ID。
- `lead_default` (Integer, 可空): 标准模板交期天数。
- `lead` (Integer, 可空): 实际或用户调整后的交期天数。
- `due_date` (Date, 可空): 经计算引擎排期出的目标到期日。
- `done_date` (Date, 可空): 实际完成日期。
- `value` (Text, 可空): 用户填报的值。
- `comment` (Text, 可空): 备注或说明。
- `link` (String, 可空): 关联附件/文档链接。
- `is_custom` (Boolean, 默认 False): 是否为用户后续在项目中临时新增的非标动作。
- `last_remind_date` (Date, 可空): 最近一次手动/自动催办日期。

---

## 3. 标准流程矩阵与调度计算引擎 (Scheduling & Status Engine)

### 3.1 标准动作矩阵定义 (Standard Matrix)
2026-09-15 用户确认先保留现有 31 个基础动作作为开发基线，原始业务矩阵后续核对。阶段 0 立项不包含标准动作，阶段 1–5 分别有 9、7、4、5、6 项。包含明确的 `lead`（交期）与 `dep`（前置依赖索引）；这一开发基线不代表业务矩阵已验收。

### 3.2 到期日推导算法 (`schedule`)
1. **基准日期判定**：
   - 若 `dep == null`：基准日期为 `project.created_at`。
   - 若 `dep != null`：基准日期优先取前置动作的 `done_date`（若已完成）；若前置未完成，则取前置动作的 `due_date`；若前置动作无 `due_date`，回退至 `project.created_at`。
2. **到期日计算**：
   - 若动作有设定的 `lead`（交期天数），则 `due_date = 基准日期 + lead 天`。
   - 若动作 `lead == null`（如部分需人工直接指定目标日的动作），且用户未录入值或到期日，则 `due_date` 为空（标记为未排期）。
3. **连锁反应触发**：
   - 当某个动作标记完成（`done_date` 被赋值）或其 `lead` 发生调整时，调度引擎递归/按依赖拓扑顺序重新推导所有后置动作的 `due_date`。

### 3.3 动作健康状态算法 (`action_status`)
- **`green` (已完成)**：`done_date` 不为空。
- **`red` (已逾期)**：`done_date` 为空，且 `due_date != null`，且 `today > due_date`。
- **`yellow` (临近到期)**：`done_date` 为空，且 `due_date != null`，且 `0 <= (due_date - today) <= 5 天`。
- **`gray` (正常未开始/进行中)**：`done_date` 为空，且距离到期日 > 5 天，或无排期到期日。

### 3.4 阶段与项目全局指标算法 (`project_summary`)
- 统计项目各阶段动作总数、已完成数、逾期数、临近到期数。
- 计算阶段状态：若该阶段所有动作 `green` -> `completed`；若有动作 `red` -> `overdue`；若有动作正在进行 -> `in-progress`；尚未开始 -> `planned`。
- 计算项目整体完成百分比：`completed_actions / total_actions * 100`。
- 提取项目红旗卡点列表（Red Flags）：按严重程度列出所有逾期动作及具体责任人。

### 3.5 团队成员更换联动机制
当更新项目的团队分配（如将 `SDE` 从人员 A 更换为人员 B）：
- 系统自动将该项目中 `fn == 'SDE'` 且**尚未完成**（`done_date is null`）的所有动作的 `owner` 批量重置为人员 B。
- 已经完成的历史动作保留人员 A 为责任人，确保过程记录的审计完整性。

---

## 4. API 接口规范 (FastAPI Endpoints)

- **`GET /api/projects`**: 查询所有项目，返回精简主数据、6 阶段状态概览、进度百分比及健康度。支持按工厂、BU、状态筛选。
- **`POST /api/projects`**: 新建项目。输入主数据与团队分配字典，后端自动创建项目记录、团队成员，并根据标准矩阵全量生成 31 个动作，执行初始排期。
- **`GET /api/projects/{id}`**: 获取指定项目的完整详情，包含全部主数据、团队列表、31+ 个动作明细（含前置依赖对象、当前值、状态、交期与到期日）。
- **`PATCH /api/projects/{id}`**: 修改项目主数据或调整团队成员（自动触发未完成动作的转派）。
- **`PATCH /api/projects/{id}/actions/{action_id}`**: 更新特定动作（填报 `value`、设置 `done_date`、调整 `lead` 交期、更新 `comment` 备注）。触发下游依赖动作的联动重新排期。
- **`POST /api/projects/{id}/actions`**: 为项目新增自定义动作（指定所属阶段、动作名、负责角色、交期与前置依赖）。
- **`DELETE /api/projects/{id}/actions/{action_id}`**: 删除自定义动作（标准动作不可删除）。
- **`GET /api/kpi/summary`**: 获取组合级 KPI（项目总数、各阶段项目分布、总逾期动作数、按职能划分的逾期分布等）。

---

## 5. 验收标准 (Acceptance Criteria)

1. **结构与启动**：后端代码目录清晰，可通过 `python -m uvicorn ...` 零报错秒级启动，SQLite 自动建表。
2. **数据完整性**：新建项目成功后，数据库中准确生成对应的主表、团队表及 31 个标准动作。
3. **调度算法准确无误**：
   - 依赖动作在前置动作完成后，后置动作的基准日自动切换为前置完成日；
   - 逾期与临近到期状态准确反映当前基准日（以系统日期为参照）；
   - 团队角色变更时，未完成动作准确无遗漏地转派给新负责人。
4. **测试覆盖**：运行 `pytest` 自动化测试，覆盖新建项目、动作完成联动排期、团队变更转派等核心路径，测试通过率 100%。


## 6. 实现约定与验证记录（2026-09-15）

- 六阶段业务状态保留本规格定义；颜色另由 `phase_health` 返回，逐阶段计数见 `phases`。
- 立项阶段无动作时为完成；存在自定义动作时按动作实际情况计算。已有完成动作或非空填报值视为进行中。
- 手动目标日需要 `lead=null`；录入 `value` 不自动修改目标日。动作完成、取消完成、交期或手动目标日更新都重算排期。
- 团队 PATCH 按角色合并，不删除未提及角色，已完成动作保留历史负责人。
- 标准动作不可删除；被后继动作引用的自定义动作返回 409，避免悬空依赖。依赖不存在或不属于项目时返回 404。
- 当前不存在项目 DELETE API；Phase-1 以第 4 节列出的八项业务接口为验收范围。
- 运行说明和精确接口约定见 `backend/README.md`，交接与验证结果见 `handoff-tooling-replacement-workflow.md`。
