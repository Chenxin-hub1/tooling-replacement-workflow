# v2 Phase-1 — 凭证状态与完成语义

来源：2026-09-22 评审反馈 B1/B2/B3/B7；决定记录见 `../constitution-doc/roadmap/v2-review-feedback.md`。

## 规则

- 状态存储枚举：`''`（未开始，筛选 "not initiated" 由此派生）| `'initiated'` | `'in_progress'` | `'approved'`；`Not applicable` 不入 status，由各 tab 既有适用性动作的值承接。
- 完成语义：
  - 带状态的动作（`statusInput`）：明确选择 `status === 'approved'` 且有有效值才完成，仅录入值不再完成；
  - 带限定选项的动作（`closesOn`）：仅选中的值在 `closesOn` 列表内才完成（PPAP Status → `Full approved`）；
  - 其余动作：录入有效值仅保存信息，须显式 Mark complete 并填写有效实际完成日期才完成。
- 显示别名（同一枚举，各 tab 用评审人措辞）：
  - CR、CVS CR：Created / Under Review / Approved；
  - Core BPW：Initiated / In Progress / Completed；
  - Pre Grain、AAR：Not initiated（空）/ Initiated / In progress / Approved。
- 用户已取消重导时的存量豁免：本次文件涉及的动作按当前有效完成证据重新判断；普通页面恢复仍不伪造批准。

## 带状态/限定选项的动作（矩阵元数据）

| 动作（tab · act） | 阶段 | 元数据 |
| --- | --- | --- |
| CR · Input CR number | 2 | `statusInput`（别名组 A） |
| CVS CR · Input CR number for CVS on Windchill | 2 | `statusInput`（别名组 A） |
| Pre Grain · Input pre-grain target date approval | 3 | `statusInput`（别名组 C=标准词） |
| Core BPW · Input BPW number | 3 | `statusInput`（别名组 B） |
| AAR · Input target date for approval | 4 | `statusInput`（别名组 C） |
| PPAP Status · Input if Draft, Interim approved, or Full approved | 3 | `closesOn: ['Full approved']` |

OEM BPW 与 Core BPW 的目标日期动作不加状态（评审人未要求，只要求 Phase-2 的双日期）。

## 改动落点

### frontend/public/workflow-core.js（规则层，vitest 覆盖）

- 新增 `STATUS_RULES`：枚举、按 `(ph, tab, act)` 匹配的元数据、别名表；
- 新增 `statusMeta(tab, act)`、`statusAlias(tab, value)`、`completesAction(tab, act, value, status)`；
- `actionValue`（导入）扩展：`statusInput` 动作的自由文本编号 → 只记 `value`，`done: null`，warning 提示状态待补；`closesOn` 动作选中非完成选项 → 只记 `value`，`done: null`；
- 测试进 `frontend/tests/`。

### frontend/scripts/prepare-prototype.mjs（生成补丁，逐条 replaceOnce 断言）

1. MATRIX 六行补元数据（上表）；
2. `openAction`：`statusInput` 动作在值输入旁渲染状态下拉（当前值选中，空选项为 "—"）；按钮对带状态动作显示 "Save status"，approved 之外不出现"Mark complete"路径；
3. 完成保存（原 `completeAction`）：带状态动作保存 `value` + `status`；`status==='approved'` 时要求完成日期并写 `done`；状态从 approved 降级时清 `done`；
4. `quickToggle`（value→done 自动完成）：带状态与 `closesOn` 未达标动作跳过自动完成；
5. 项目动作表与 My Actions 行：带状态动作在值旁显示状态 chip（`stTag` 风格），完成列仍显示 `done` 日期；
6. 演示数据 seed：已完成（doneIdx）的带状态动作补 `status:'approved'`，PPAP Status 动作 value 设 `Full approved`；
7. 新增插值全部内联 `escHtml`/`escJs`（helpers 由既有注入提供）。

### frontend/public/improvements.js（存量兼容）

- 工作区加载后，对快照 `MATRIX` 与各项目动作按 canonical `STATUS_RULES` 回填元数据（旧 JSON 无这些字段）；带状态且 `done` 且非导入项目的动作不改写（由交互侧保存时归一）。

### backend

- `app/engine/scheduler.py`：`StandardAction` TypedDict 增加可选 `status_input`/`closes_on`，六行补齐；
- `app/models/action.py` + migration：`ProjectAction.status: str | None`；
- `app/schemas/action.py`：`ActionBase/ActionCreate/ActionUpdate` 增加可选 `status`；
- `app/schemas/workspace.py`：`valid_actions` 增加可选校验——`status` 若存在必须是 `''`/`initiated`/`in_progress`/`approved` 之一；
- pytest：矩阵元数据完整性（5 行 statusInput、PPAP closesOn）、schema 往返、workspace PUT 带 `status` 通过、非法 `status` 422。

## 验收

1. e2e：CR 输入编号并保存 → 动作仍开放、状态显示 Created/所选值；选 Approved 并填完成日期 → 动作完成；改回 Under Review → 动作重新开放；
2. e2e：PPAP Status 选 Draft → 开放；选 Full approved → 完成；
3. e2e：存量 46 项目加载后各动作 done 状态与升级前一致（快照对比），状态列显示"—"；
4. vitest + pytest 全绿；`prepare-prototype.mjs` 构建通过（断言计数更新）；
5. 手工核对：My Actions、Management 视图、提醒预览不因状态字段出现异常。

## 补齐规则（2026-09-22）

- 所有普通动作提供 Save information；明确选择 Approved / Completed / Full approved 可完成。
- 修改已完成的值清空 done；原 status 为 approved 时降为 in_progress，除非同一次保存显式重新批准。无变化保存保留原状态。
- Excel 普通值与适用性选择不产生完成日期；仅显式完成日期或最终批准构成完成证据。
- 工作区恢复不得把旧 done 推断成新审批，演示数据只在 seed 时明确设置；既有导入状态保持不变。

- PPAP 弹窗显示 Save status（Draft/Interim）或 Mark complete（Full approved），与行内批准语义一致；API 同样拒绝空值或占位编号完成。
