# v2 Phase-2 — 日期历史（原始/当前双日期）

来源：2026-09-22 评审反馈 B4/B5/B8（"original date to be not modify... everyone to know date has been moved from original date"）；决定记录见 `../constitution-doc/roadmap/v2-review-feedback.md`。

## 规则

- 六处关键日期动作拆分为双日期：
  | 动作（tab · act） | 阶段 |
  | --- | --- |
  | FOT Date · Input Supplier's target date for FOT | 2 |
  | PPAP Sample Date · Input Supplier's target date for Samples | 2 |
  | PPAP Submission Date · Input Supplier's target date for PPAP submission | 2 |
  | Pre Grain · Input pre-grain target date approval | 3 |
  | AAR · Input target date for approval | 4 |
  | OEM BPW · Input target date for approval | 4 |
- 存储：动作新增 `orig`（ISO 日期字符串，原始日期）与 `origLog`（Admin 修正留痕数组）；`value` 保持为当前日期。
- 语义：
  - 首次录入：`orig = value`（首次值即原始日期）；
  - 后续修改：只更新 `value`，`orig` 不动；`orig ≠ value` 时界面显示"已挪期"标记（`moved from <orig>`），评审人原话要求人人可见；
  - 清空重填：`orig` 保留（原始承诺不因清空而丢失）；
  - Admin 修正：仅 Admin 可改 `orig`（处理手误），每次修正向 `origLog` 追加 `{ts, by, from, to}`；
  - 既有数据升级：加载时 `orig` 缺失且 `value` 非空的动作补 `orig = value`（含导入项目——提案已接受的升级规则；普通恢复不改 `done`/`status`；显式重导时按 Phase-1 当前规则重新判断）。
- "Due"列（排期推算的到期日）与交期调整不在本 Phase 范围。

## 改动落点

### frontend/public/workflow-core.js（规则层，vitest 覆盖）

- 新增 `DATE_HISTORY_RULES` 与 `dateHistoryRule(ph, tab, act)`（按六处动作精确匹配）；
- 导出给 `improvements.js` 使用；测试覆盖六处命中与相邻不误命中（如 Core BPW 目标日期、SOP）。

### frontend/public/improvements.js（交互层）

- `setValue`：先记 `previous`，双日期动作在值写入后若 `orig` 缺失则 `orig = previous || value`；值变化导致 `orig ≠ value` 时 toast 提示已挪期；
- `completeAction`：双日期动作保存值前同样补 `orig`（弹窗预填后编辑不丢原始值）；
- `openAction`：双日期动作预填当前值，弹窗显示只读"Original date"；Admin 额外获得修正输入与按钮（校验 ISO 日期，写 `origLog`）；
- `inputField`：双日期动作在日期输入后追加 `moved from <date>` 提示（仅 `orig ≠ value` 时）；
- `normalizeStatusData` 扩为 `normalizeV2Fields`：补 `orig`（全部项目），不动既有 `done`/`status`，不生成虚构历史；
- 导入映射：双日期动作 `result.value` 写入时同步补 `orig`（缺才补）。

### backend

- `app/engine/scheduler.py`：`StandardAction` 增加可选 `dual_date: bool`，六行补齐（矩阵元数据与前端规则一致）；
- `app/models/action.py` + migration 0004：`ProjectAction.orig: date | None`；
- `app/schemas/action.py`：`ActionBase` 返回可选 `orig: date`；创建/更新不开放任意覆盖原始日期，动作更新时自动保留首次日期；
- `app/schemas/workspace.py`：`valid_actions` 校验 `orig` 为合法 ISO 日期字符串；
- `app/db/migrations.py`：`BASELINE_EXCLUDED_COLUMNS` 追加 `("project_actions", "orig")`；
- pytest：六行 `dual_date` 完整性、workspace `orig` 校验、原始日期列为 0004，完整历史迁移 head 为 0005。

## 验收

1. vitest/pytest/e2e 全绿；prettier 与 ruff 通过；
2. e2e：FOT 首录日期 → 无标记；改成另一日期 → 出现 `moved from` 且原始日期不变；Admin 修正原始日期后留痕；
3. 真实工作区（52 项目）经新 schema 校验无损，既有带值日期动作补齐 `orig` 后 `orig === value`（无挪期假象）；
4. 像素对比用例不受影响（标记位于"Required input"列内，该列在对比中两侧同收起）。

补完记录：日期统一为 ISO 后比较，避免显示格式造成假挪期；清空保留原始日期但不显示假挪期。动作行增加 Dates 入口，弹窗可查修正历史；校验完成日期通过前不修改任何动作字段。

## 完整改期历史（2026-09-22）

- dateLog 追加 `{ts, by, from, to, source}`，ts 为 UTC ISO 时间；from/to 为 ISO 日期或空串；source 为 edit/import。首次录入、改期、清空记录，无变化/无效输入不记录。
- 不为存量数据虚构改期时间。旧快照缺 dateLog 仍兼容；完整历史在 Dates 弹窗、JSON 备份与 Excel 中保留。
- 项目首表使用 `字段名 — Date history` JSON 列，动作明细用 `Current date history`。已有项目保留本地历史，导入变更追加记录；新项目可恢复合法连续历史。
- API 使用 date_log JSON 字段（migration 0005），写入人标识 API；原始日期维持自动保留。
