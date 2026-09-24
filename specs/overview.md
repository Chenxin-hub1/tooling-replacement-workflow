# 整体功能流程说明（Overview Spec）

写给不熟悉业务流程的读者：这套系统是做什么的、页面里每个东西是什么意思、一条模具项目从立项到客户批准怎么走、数据怎么存。分阶段的详细规格见同目录其他文件；术语定义见 [`.skills-doc/CONTEXT.md`](../.skills-doc/CONTEXT.md)。

依据：`frontend/public/prototype.js`（样板生成）、`workflow-core.js`（规则层）、`improvements.js`（授权修正）、`backend/app/api/workspace.py`，截至 2026-09-24。

## 1. 一句话

把原来靠 Excel（Master Changes and OIL 表）手工跟踪的**模具更换项目**搬进网页：每个项目自动生成一张跨职能的**行动清单**，每条行动有责任人、交期、状态；看板按项目、职能、人员汇总逾期；数据保存在服务器，Excel 可导入导出。

打个比方：Excel 是一张大表，人人各填各的；这套系统是一块共享的看板，行动卡片按流程自动排好、自动算交期、到期变色。

## 2. 核心概念

| 概念 | 含义 | 在数据里 |
| --- | --- | --- |
| 项目（Project） | 一个模具更换案子，对应 Master 表的一行。编号 `TR-YYYY-NNN`（页面新建）或 `IMP-…`（Excel 导入，由零件号/模具标签/模穴数/PPAP ID/TOOL ID 哈希得到） | `projects[]` |
| 主数据 | 零件号、描述、工厂、BU、原因、新旧供应商、Tool PO、Tool Tag、模具归属、模穴数、OEM、Tech、年节省 | 项目字段 |
| 团队（Team） | 项目里每个**职能**对应一个人。职能默认 6 个：BU Buyer（发起人）、SDE、PM、ENG、SP/BU、Accounting；SDE/PM/ENG/SP/BU 必填 | `project.team[fn]` |
| 阶段（Phase） | 4 个：1 Tool Creation（立项）、2 Development（开发制造）、3 Internal Approval（内部审批）、4 Customer Approval（客户审批）。立项阶段没有行动，项目创建即完成 | `action.ph` 0–3 |
| 行动（Action） | 一条要做的事：所属阶段、Tab（短名）、Action（做什么）、Required input（要填什么）、职能、责任人、交期、完成日、填报值 | `project.actions[]` |
| 标准模板（MATRIX） | 20 条标准行动，新建项目时自动生成（见第 3 节）。Admin 可在"添加项目项"时勾选"同时加入模板" | `MATRIX` |
| 自定义行动 | 项目里手工加的行动，编号 `<项目>-cN`，可删（创建者或 Admin） | `action.custom` |
| 交期（Due） | 由 **lead（交期天数）+ 起算点** 自动算：起算点是前置行动的完成日（没完成就用它的交期），没有前置则用项目创建日 | `lead`、`dep`、`due` |
| 状态颜色 | 绿 = 已完成；红 = 逾期；黄 = 即将到期（默认 5 天内，规则可调）；灰 = 未开始或没有交期 | 由 `done`、`due` 推导 |
| 凭证状态 | CR、CVS CR、Core BPW、Pre Grain 日期、AAR 日期这 5 条行动，除了填值还要选审批状态；**只有 Approved 才算完成** | `action.status` |
| 双日期 | 6 条关键日期行动记录**原始日期**和**当前日期**，改期后显示"moved from 原始日期"，每次改动记历史 | `orig`、`value`、`dateLog`、`origLog` |

### 完成规则（谁算做完了）

- 普通行动：填值只是"保存信息"，要点 **Mark complete** 并填实际完成日才算完成。
- 凭证类行动（CR、CVS CR、Core BPW、Pre Grain 日期、AAR 日期）：状态选 **Approved** 才完成；降回其他状态则重新打开。各 Tab 用业务口径显示：CR 用 Created / Under Review / Approved，BPW 用 Initiated / In Progress / Completed。
- PPAP Status：只有选 **Full approved** 才完成，Draft / Interim approved 只保存。
- 改动已完成行动的值：完成标记清空，Approved 降为 In progress。
- 占位值（PEND、TBD、N/A、? 等）不算有效值。

## 3. 标准流程模板（20 条行动）

lead 是默认交期天数；"起算"为空表示从项目创建日起算，否则从所指行动起算。"—"表示流程表没给默认天数，需在项目里手填。

**2 Development（11 条）**

| # | Tab | Action | 填什么 | 职能 | lead | 起算 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | CR | Input CR number | CR 编号 | SDE | 7 | | 凭证状态 |
| 1 | PPAP ID | Input PPAP ID number | PPAP ID | BU Buyer | 7 | | |
| 2 | FOT Date | Supplier's target date for FOT | 日期 | SDE | 7 | | 双日期 |
| 3 | PPAP Sample Date | Supplier's target date for Samples | 日期 | SDE | 7 | | 双日期 |
| 4 | PPAP Submission Date | Supplier's target date for PPAP submission | 日期 | SDE | 7 | | 双日期 |
| 5 | Current Coverage | Date of coverage on current supplier | 日期 | BU Buyer | 7 | | |
| 6 | BPO | Input BPO number | BPO 编号 | SP/BU | 30 | | |
| 7 | Change | External or Internal | 二选一 | PM | 7 | | |
| 8 | SOP | Date needed by ZF to implement | 日期 | BU Buyer | 7 | | |
| 9 | CVS CR | Applicable or not | 二选一 | ENG | — | | |
| 10 | CVS CR | CR number for CVS on Windchill | CR 编号 | ENG | — | #9 | 凭证状态 |

**3 Internal Approval（5 条）**

| # | Tab | Action | 填什么 | 职能 | lead | 起算 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | PPAP Status | Draft / Interim approved / Full approved | 三选一 | SDE | — | #4 | 仅 Full approved 完成 |
| 12 | Pre Grain | Applicable or not | 二选一 | SDE | — | | |
| 13 | Pre Grain | Pre-grain target date approval | 日期 | SDE | — | #12 | 凭证状态 + 双日期 |
| 14 | Core BPW | Input BPW number | BPW 编号 | PM | 175 | | 凭证状态 |
| 15 | Core BPW | Target date for approval | 日期 | PM | — | #14 | |

**4 Customer Approval（4 条）**

| # | Tab | Action | 填什么 | 职能 | lead | 起算 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 16 | AAR | Applicable or not | 二选一 | SDE | — | | |
| 17 | AAR | Target date for approval | 日期 | SDE | — | #16 | 凭证状态 + 双日期 |
| 18 | OEM BPW | Identify BPW number | BPW 编号 | PM | — | | |
| 19 | OEM BPW | Target date for approval | 日期 | PM | 175 | | 双日期 |

原第 5 阶段 Scrap（旧模处置）和第 6 阶段 Archive 已于 2026-09-22 评审删除；旧工作区里这些行动保留在 `retiredActions`，页面和 Excel 不再显示。

## 4. 页面与流程

左侧导航固定：**Signed in as**（选自己是谁，没有账号密码）、Portfolio、My actions、Management、Reminders、Admin、+ New project。所有页面共用一套筛选条（项目/零件号搜索、项目负责人、BU、工厂、供应商、阶段、状态、仅逾期）。

### 4.1 Portfolio（项目组合）

一行一个项目：编号、零件、工厂/BU、四段**阶段条**（当前阶段下有标记，颜色为该阶段健康度）、整体状态、完成百分比、负责人、总交期天数（有手调交期时标"adjusted"）、预计完成日、下一里程碑、逾期数。Admin 额外看到"delete"。

顶部三个按钮：**Import template**（下载空模板）、**Upload Excel**（导入，见第 6 节）、**Export to Excel**。v2 增加 PPAP Status / BPW / Pre Grain / AAR 四个审批状态筛选，筛选结果同时决定导出范围。

### 4.2 New project（新建向导，3 步）

1. **Initiator inputs**：主数据。零件号、描述、工厂、BU、原因、新旧供应商必填；创建日固定为今天。
2. **Team**：发起人自动是当前用户（BU Buyer）；给 SDE、PM、ENG、SP/BU（必填）和 Accounting 选人。
3. **Generated action plan**：预览按模板生成的 20 条行动、默认交期和预计完成日，点 Create project 落库。编号取当年未用的最小 `TR-YYYY-NNN`。

### 4.3 Project（项目详情）

- 顶部 4 个指标：完成率、当前阶段、总交期与预计完成日、逾期数与下一里程碑。
- **Timeline**：三个阶段末里程碑相对今天的位置。**Red flags**：逾期行动清单。
- **1 Tool Creation** 卡片：主数据和团队，点 Edit 可改；换人会把该职能所有**未完成**行动转给新人，已完成的保留原责任人。
- **行动表**（按阶段分组，每段有 "+ Add item"）：每行可直接改填报值（下拉或输入框，凭证行动旁有状态下拉，双日期行动有"moved from"标记和 Dates 按钮）、改交期天数（Adjusted 列，改了就重算自己和下游）、直接改到期日（换算成天数）、备注；Complete 按钮打开更新弹窗，Remind 打开提醒预览。
- **更新弹窗**：填值、实际完成日、链接、备注。普通行动有 **Save information**（保持打开）和 **Mark complete**；凭证行动按钮随状态变成 Save status / Mark complete；双日期行动显示原始日期、修正历史和改期历史，Admin 可 **Correct original**（留痕）。
- **Add item**：阶段、Tab、Action、填什么、职能、责任人、交期天数、起算行动、备注，可勾选"也加入标准模板"。

### 4.4 My actions（我的待办）

当前用户名下的行动，未完成在前、按交期排序；显示下一次提醒日期、剩余/逾期天数，Update action 打开同一个弹窗。左侧导航的数字是未完成条数。

### 4.5 Management（管理看板）

活跃项目数、正常/风险/逾期项目数；逾期行动按项目、按职能、按责任人、按阶段的横条图，用来找卡点。

### 4.6 Reminders（提醒与升级规则）

规则：到期前 N 天提醒（默认 5，同时决定黄色"即将到期"）、到期当天提醒、逾期后每 M 天重复（默认 2）、逾期超过 K 天抄送项目负责人升级（默认 5）、渠道（Email / Teams / 两者）。右侧显示"今天会发什么"、手动提醒记录、未来 7 天数量。**当前只是预览，不会真的发邮件或 Teams 消息**；生产接入 Power Automate 是后续事项。

### 4.7 Admin（人员与职能）

- **Data & saving**：下载/加载工作区 JSON 文件、导出全部 Excel、重置为演示数据（存在非演示项目时会先自动下载备份）、未保存的本地备份列表。
- **People**：按职能维护人员和邮箱，勾选 Dashboard admin（至少保留一个）。Admin 能删项目和任何自定义行动。
- **Functions**：改名、改团队页标签、设必填、增删职能。改名会同步模板、人员和所有项目。

## 5. 一条项目怎么走完（示例）

1. BU Buyer 在向导里填主数据、选团队，生成 20 条行动，每条已按默认交期排好到期日；没有默认天数的 8 条显示红框，等负责人填交期。
2. SDE 在 My actions 看到 CR、FOT Date 等到期项：填 CR 编号并把状态设 Created → 行动仍打开；审批通过后改 Approved 并填完成日 → 变绿，下游 CVS CR 的到期日按实际完成日重算。
3. 供应商把 FOT 从 5 月 20 日推到 6 月 3 日：SDE 改当前日期，原始日期不动，行内出现 "moved from 20 May"，改期历史记一条。
4. Core BPW 175 天交期到了还没填：变红，Reminders 预览里出现逾期提醒，逾期 5 天后抄送项目负责人；管理看板"按职能"里 PM 的逾期数 +1。
5. PPAP Status 选到 Full approved，AAR、OEM BPW 完成后项目 100%，Portfolio 状态变绿。

## 6. Excel 导入导出

- **导出**（Portfolio / 项目 / Admin）：首表一行一个项目，主数据 + 团队 + 每条行动一列（同 Tab 多条时列名为 "Tab – 填什么"），v2 追加 `— Approval status`、`— Original date`、`— Current date`、`— Date history`、`— Completed date` 列；第二张表是动作明细；另有导入模板。
- **导入**（Portfolio → Upload Excel，只读第一张表）：
  1. 浏览器解析，列名按别名匹配（支持真实 Master 表的列名，如 "ZF Tool PO"、"OEM - Tech"、"Coverage"、"TIER 2 SOP"）。
  2. 生成**预览**：新增/更新条数、逐行警告（占位值、缺创建日期、缺团队角色、无法解析的日期等），阻断项（红）不允许应用。缺创建日期时可在预览里统一指定一个确认过的日期，不会猜。
  3. 勾选"我已复核"后 Apply，一次写入服务器；预览期间工作区被别人改过则拒绝，需重新上传。
  - 有 Project ID 列按编号更新，没有则按零件号/模具标签/模穴数/PPAP ID/TOOL ID 算稳定编号 `IMP-…`（**注意**：多行单元格的换行符会影响哈希，回导时保留导出的 Project ID 列最稳妥）。
  - 值的规则：普通编号/日期/适用性只录入，不算完成；有效的 Completed date 或最终批准才算完成；凭证行动导入有效编号视为 Initiated；BPW 一格多个编号按 Core/客户标签拆到 Core BPW / OEM BPW，无标签默认 Core 并留警告。
  - 原始行完整保存在项目详情的 **Imported data review** 里，可对照源表。
  - 日期单元格按表格显示的日历日期导入，不受浏览器时区影响（2026-09-24 修复）。

## 7. 数据怎么存

- 整个工作区（项目、行动、人员、职能、模板、规则）是**一份 JSON**，存在服务器 SQLite 的 `workspaces` 表；页面打开时 `GET /api/workspace` 取回，每次改动后自动 `PUT` 回去。这是页面唯一的业务数据接口。
- **版本号防覆盖**：每次保存带上取回时的版本号，服务器版本已经变了（别人先保存了）就拒绝，页面提示先"Save workspace file"再刷新。两人同时改同一工作区会互相碰撞，这是当前架构的已知限制。
- **本地备份**：服务器没确认的改动会存进浏览器 localStorage，Admin 页可下载或删除。
- **服务器快照**：每次真实变更后在数据库同目录 `backups/workspace/` 留一份 JSON，滚动保留 50 份。
- 服务端对 JSON 做结构校验（编号唯一、依赖无环、日期合法、状态枚举、10 MB 上限等），加载工作区文件也要先过 `/api/workspace/validate`。
- 数据库文件 `backend/tooling.db` 随 Git 仓库分发，服务器用 Docker Compose 运行；更新步骤见 `docs/deployment.md`。

## 8. 当前边界

- 没有登录账号：Signed in as 是任选下拉，Admin 权限靠选名字；来源检查只防跨站请求，不是权限控制。
- 提醒只预览不发送。
- 旧模处置（Scrap/Archive）已移出范围。
- 后端还保留一套按项目/行动拆表的 REST API（`/api/projects`、`/api/excel`、`/api/kpi`），页面不使用，保留为历史实现。
