# v2 — 评审反馈：状态跟踪与流程瘦身

## Charter

落地 2026-09-22 工具评审反馈（B 清单）：为凭证类动作引入统一四态状态与"录入≠完成"语义，为六处关键日期引入"原始/当前"双日期历史，工作流从 6 步瘦身为 4 步（删除 Scrap 与 Archive），Portfolio 增加四个状态筛选。本版本不接通真实邮件/Teams 发送（Q5 未答复，维持预览），不处理评审人搁置的 B6 项，真实数据按用户本次指示重导并重新核验完成，Q1/Q3/Q4 的歧义列继续保留待确认。

## Acceptance

1. 项目详情与 Portfolio 进度条为 4 段；第 5/6 步不再出现在矩阵、Phase 筛选、My Actions、Management 视图与导出布局中；矩阵由 31 项减为 20 项；
2. CR、CVS CR、Pre Grain、AAR、Core BPW 各 tab 有状态选择；仅状态为 Approved（PPAP 为 Full approved）时动作计为完成，仅录入编号/日期不再显示完成；
3. FOT Date、PPAP Sample、PPAP Submission、Pre Grain、AAR、OEM BPW 六处日期：首次录入成为只读"原始日期"，后续修改只更新"当前日期"，界面同时显示两值并有"已挪期"标记；Admin 修正原始日期留痕；
4. Portfolio 新增四个筛选：PPAP Status（not created / draft / interim / approved）、BPW（not initiated / in progress / completed，取 Core BPW 状态）、Pre Grain、AAR（四态值集）；
5. 导入维持占位值保护；既有 46 条真实项目重导时按当前规则重新判断完成，不再豁免历史状态；导出新增状态列与双日期列；
6. 全部 Python 测试与 e2e 通过（按 4 步流程更新后）。

## Phase-1: 凭证状态与完成语义

Status: `awaiting-acceptance`（全局录入与完成分离已补齐）

Description: 引入统一四态状态（Not applicable / Not initiated / In progress / Approved，各 tab 保留评审人措辞为显示别名），落到 CR、CVS CR、Pre Grain、AAR、Core BPW，并改为"仅 Approved 计完成"（PPAP 维持 Draft / Interim approved / Full approved，Full approved 计完成）。

Spec: specs/v2-status-semantics.md

实施记录（2026-09-22）：规则层进 `workflow-core.js`（`STATUS_RULES`/`statusRule`/`closesRule`/`statusAlias`/`actionCompletes`，导入 `actionValue` 增加可选 meta）；交互覆写与启动归一进 `improvements.js`（`setValue`/`completeAction`/`openAction` 注入状态下拉并预填已存值、`inputField` 行内状态选择、`setStatus`、`restore` 后 `normalizeStatusData`，导入项目豁免）；后端矩阵元数据（`status_input`/`closes_on`）+ `ProjectAction.status` 列（migration 0003）+ schema 枚举校验；`needs_baseline` 基线排除 0001 后增量列以维持 Phase-1 基线语义。验证：vitest 23/23（含 8 项新语义）、pytest 86/86（含 5 项新测试与迁移基线用例更新至 0003）、e2e 17/17（向导用例改走状态开关、像素对比例对"Required input"列两侧同收起——该列为授权增量所在）、ruff 与 prettier 通过、真实工作区（52 项目）经新 schema 校验无损且 0 个 status（存量豁免成立）。

## Phase-2: 日期历史（原始/当前双日期）

Status: `awaiting-acceptance`

Description: 六处关键日期拆分为只读原始日期与可更新当前日期，含改动留痕、界面"已挪期"标记与 Admin 修正通道。

Spec: specs/v2-date-history.md

## Phase-3: 流程瘦身（删除第 5/6 步）

Status: `awaiting-acceptance`

Description: 删除 Scrap 与 Archive 两阶段及其 11 项动作，进度条改 4 段，Accounting 保留角色但不再有待办；mission 同步修改随本提案接受一并执行。

Spec: specs/v2-four-step-flow.md

## Phase-4: Portfolio 状态筛选

Status: `awaiting-acceptance`

Description: Portfolio 增加 PPAP Status、BPW（Core BPW 状态）、Pre Grain、AAR 四个筛选，值集见本文档决定记录。

Spec: specs/v2-portfolio-filters.md

## Phase-5: 导入导出对齐与真实数据重导

Status: `awaiting-acceptance`（歧义映射已于 2026-09-23 按用户拍板落地并重导，见文末记录）

Description: 导入导出适配状态与双日期字段；按新规则重导已有来源行，BPW / CVS CR / OEM - Tech 歧义映射原待 Q1/Q3/Q4，2026-09-23 用户决定直接采用数据分析推测的关系并已实现重导。本 Phase 承接 v1 Phase-4 的遗留重导事项（见"v1 收尾安排"）。

Spec: specs/v2-excel-realign.md

## 决定记录（2026-09-22，用户已拍板）

### 样板锁定解除

v1 曾记录"UI 与功能完全遵循原始样板，禁止独立设计"。自本版本起，下列经用户批准的偏离生效；未列出的部分仍遵循样板：

| # | 评审反馈 | 落点 | 决定 |
| --- | --- | --- | --- |
| B1 | CR 加状态 | 第 2 步 CR | 采纳，四态（显示 Created / Under Review / Approved） |
| B2 | CR CVS 加状态 | 第 2 步 Development（用户本次明确 Step 对应流程编号） | 采纳，同 B1 |
| B3 | 录入≠完成 | 全局完成语义 | 采纳，见 Phase-1 |
| B4 | FOT/PPAP 样件/PPAP 提交双日期 | 第 2 步三处日期 | 采纳 |
| B5 | Pre Grain 双日期 | 第 3 步 Pre Grain | 采纳 |
| B6 | "I do not see this part necessary" | 不明 | 搁置，评审人澄清前不处理 |
| B7 | Core BPW 加状态标签 | 第 3 步 Core BPW 编号旁 | 采纳，四态 |
| B8 | AAR / OEM BPW 双日期 | 第 4 步两处日期 | 采纳 |
| B9 | 删除第 5、6 步 | Scrap + Archive | 采纳，直接删除（46 条真实项目中这两步数据为 0，已核实） |
| B10 | Portfolio 四个状态筛选 | Portfolio | 采纳，见 Phase-4 |

### 四态状态模型

- 统一枚举：`Not applicable / Not initiated / In progress / Approved`，审批动作仅明确 Approved 完成（PPAP 为 Full approved）；普通动作须显式确认完成；
- 显示别名保留评审人措辞：CR 与 CVS CR 显示 Created / Under Review / Approved；Core BPW 显示 initiated / in progress / completed；Not applicable 由各 tab 现有适用性问题承接，不重复设值；
- PPAP 保持 Draft / Interim approved / Full approved：临时批准是真实业务台阶，不压扁；
- 状态回答"走到哪"，双日期回答"定在何时、挪过没有"，互补不重叠。

### 双日期规则

- 首次录入即"原始日期"，普通用户只读；修改只动"当前日期"；
- 原始终值 ≠ 当前值时界面显示"已挪期"标记（评审人原话要求 everyone to know date has been moved）；
- Admin 可修正原始日期（处理手误），修正留痕；
- 既有数据升级规则：当前值同时成为原始值与当前值。

### 导入旧数据处理

- 用户本次明确要求“重新导入数据重新按照新规则来”，取消旧完成状态豁免。重导仅以本次有效完成日期或明确最终批准判断；同值重导也重算，缺少证据重新开放。原始来源、值、历史、人员和未涉及项目保留。

### Portfolio 筛选值集

- PPAP Status：not created（未填）/ draft / interim（Interim approved）/ approved（Full approved）；
- BPW：not initiated / in progress / completed，取 Core BPW 状态（值集与 B7 一致，评审人已自答）；
- Pre Grain / AAR：四态值集；升级为真实状态字段（放弃派生值方案——派生无法表达"进行中 vs 已批准"，与 B3 逻辑冲突）。已列入待评审人确认清单，若其提出业务中间态则在枚举中加值，不影响机制。

### 搁置与外部依赖

- B6：搁置至评审人澄清；
- Q1–Q5：不阻塞 B 类实施；Q1 顺带确认 BPW 全称、一格多号（Ford/STLA）归 Core/OEM 规则；Q5 答复前通知维持预览；
- Q2 已由用户要求按新规则重导解决；Q1/Q3/Q4 的歧义映射仍不推测。（2026-09-23 更新：Q1 的一格多号规则与 Q3/Q4 的歧义映射已由用户拍板按推测关系落地，见文末；仅 BPW 英文全称仍待业务确认。）

## v1 收尾安排（随本提案接受一并生效）

v1 Phase-4（Excel Integration & Real-Data Readiness）的正式导入已于 2026-09-18 按领导指示执行完毕；其遗留的"答复到位后重导补映射"事项移入本版本 Phase-5。v1 其余 Phase 按既有验收流程收尾后，mission 版本表移除 v1 行。

## 待接受的 mission 修改

1. Versions 表新增 `[v2-review-feedback](roadmap/v2-review-feedback.md) | planned`；
2. GOAL_1"6 阶段全生命周期"改为"4 阶段"（Tool Creation → Development → Internal Approval → Customer Approval）；
3. 背景痛点 3（旧模处置闭环断裂）标注：经 2026-09-22 评审决定移出系统范围（评审人认定对该 SharePoint 不相关）。


## 2026-09-22 全项目核验补完

Phase-2–4 已实现，等待业务验收；Phase-5 代码和往返测试已完成，真实数据重导仍等待 Q1–Q4，保持 in-progress。标准项数量经逐行核对修正为 20（原模板 Scrap 5 项 + Archive 6 项，共移出 11 项），不新增未定义动作凑数。旧阶段记录保留在工作区 JSON，当前视图与 Excel 不参与统计。

校验和证据见 `../../docs/project-verification-2026-09-22.md`。本次未关闭版本、未改变 mission 版本状态；v1 的历史截图/矩阵数量以 v2 已确认范围为后续实现依据。遗留问题均已明确归于 Phase-5 / Q1–Q5，未留下已完成事项的悬空票号。

## 本次补齐范围（2026-09-22）

普通动作录入只保存信息，显式 Mark complete 才完成；审批动作需明确批准，PPAP Full approved 属明确批准。修改已完成内容重新开放，修改已批准凭证回到 In progress。六处日期增加完整 dateLog，覆盖首次录入、改期、清空与导入，并保留 origLog。B6 用户明确暂不处理；CVS CR 的适用性和编号迁至第 2 步 Development，保留 ID、依赖和状态。存量状态不批量改写。

用户补充确认：B6“这个暂时不管”；Step2 指六流程中的流程2，因此覆盖此前位置决定，将 CVS CR 两项迁至 Development。

本次最终验证：144 pytest、41 Vitest、34 Playwright 全部通过，Ruff/ty/Prettier、语法检查与构建通过；真实数据临时副本迁移至 0005 后原有导入完成状态保持不变。Phase-1/2 保持 awaiting-acceptance，Phase-5 的业务歧义重导仍待原有问题答复。

## 历史数据按新规则重导（本次执行）

Status: `awaiting-acceptance`（本次新规则重导已完成；Phase-5 歧义映射仍待确认）

用户明确取消此前“存量完成状态不动”的例外；在备份后从 importSource 保存的原始行重放，重新计算完成。原始日期锁定用于保留计划基准，本次仅解释原因，未收到放开普通编辑的要求。

本次重导已实际写入本地数据库：46 项目、198 个完成按新规则调整为 5 个，193 个重新开放；完整备份与 CAS 校验通过。159 pytest、55 Vitest、36 Playwright 全部通过。详见 `../../docs/data-reimport-2026-09-22.md`。Phase-5 只剩 Q1/Q3/Q4 歧义映射待确认；此前“未写数据库/存量不改”段落为历史记录，以本段为准。

## BPW 工作定义与 Docker 发布补充

按用户提出的解释暂定“BPW 变更审批流程”为项目工作定义：Core 为内部审批，OEM 为客户相关审批或客户批准记录；Business Process Workflow 仍是候选全称。术语见 `../../.skills-doc/CONTEXT.md`。这不自动解决原 Excel 未区分 Core/OEM 的 BPW 列及多编号映射问题。服务器方式已明确为 Docker Compose，停服备份、数据卷更新和版本保护的部署步骤已补齐，见 `../../docs/deployment.md`。

Docker 安装脚本先在临时副本完成迁移，再备份旧数据库（含已提交 WAL）并替换，同时将 revision 提升到旧库与发布库之上。167 pytest、ruff、ty 通过；隔离 Compose 实测旧库 revision 100 更新至 101、迁移至 0005、52 项目/46 导入项目/5 个已完成导入动作正确、旧页面写入返回 409、健康检查通过，发布数据库未改动。服务器尚未执行更新。

## BPW / CVS CR / OEM - Tech 歧义映射落地（2026-09-23）

Status: `awaiting-acceptance`

用户拍板不再等待 Q1/Q3/Q4 答复，直接采用对 46 行 importSource 原文的数据分析推测关系（一格多号按文字标签 Ford/STLA/Core 分流、无标签默认 Core 并逐行留痕、编号导入即置 initiated 不算完成、OEM - Tech 落主数据 `tech` 字段），实现于 `workflow-core.js`（`splitBpwCell`）与 `improvements.js`（`prepareImport`），重导经真实页面链路执行：46/46 处理、0 阻断、revision 3 → 4、完成数 5 → 5、非导入项目与全部 ID/依赖保持；重导驱动固化为 `frontend/scripts/reimport-workspace.mjs` 可复用。验证：167 pytest、60 Vitest、37 Playwright、ruff/ty/prettier/构建全绿。证据与口径详见 `../../docs/bpw-mapping-2026-09-23.md`。此前各段"歧义映射待确认"的表述以本段为准；剩余仅 BPW 英文全称（原 Q1 之一）与 6 行 External 无标签编号的 Core 假设待业务核对。
