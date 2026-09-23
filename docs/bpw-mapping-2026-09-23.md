# BPW / CVS CR / OEM - Tech 歧义映射落地（2026-09-23）

真实 Excel 的三列自首次导入（2026-09-18）起只原文存档于 `importSource` 并标记"Unmapped / ambiguous"。原计划等领导答复 Q1/Q3/Q4；2026-09-23 用户拍板**直接采用数据分析推测出的关系**，后期需要再改（页面可手动修改，下次重导前手改一直有效）。

## 数据关系（推测依据）

对 46 行 `importSource` 原文做值分布、交叉与备注文本分析得出：

1. **BPW 列混装内部与客户两类审批编号**。12 行有编号，仅 1 行带文字标签：
   `BPW-26-34300066 Ford / BPW-25-34300392 STLA / BPW-26-34300153 Core`
   ——同一项目对内部（Core）与各客户（Ford、STLA）**分别**办 BPW、各拿各的号。
   其余 11 行无标签（5 行 Internal + 客户审批不需要；6 行 External + Pending）。
   编号格式 `BPW-年份-流水号`，前缀随工厂（412A → 411xxxxx，454A → 343xxxxx）；
   备注显示 BPW 流程涉及实物送审与测试（"ask parts for BPW"、"BPW Testing"）。
   37 行有值中 25 行仍是 Pending/TBD——**有编号 ≠ 办完**。
2. **CVS CR 是与内部 CR 并行的另一条 CR**：编号同格式不同号、同行共存；一个 CVS CR
   可盖多行（CR0621265 / CR0621263 两行共用 CVS CR0625915，捆绑关系）；备注与
   Ford 确认绑定（"waiting on confirmation from ford… CVS open points"）。
3. **OEM - Tech 是产品技术平台分类**，不是审批：46/46 全填，值域八个
   （Buckles 3F / SPR4 / FS1 / SPR8 / Tongues / 3PGA / ESA4 / RNS 34-F），
   按工厂聚类。

## 用户拍板的三项口径

1. 走"实现映射 + 重导"路线（留痕最完整，将来重导自动处理这三列）。
2. 无标签 BPW 编号默认归 **Core BPW**，导入警告留痕
   `BPW: N number(s) without a Core/OEM label — assumed Core; confirm with the business owner.`
3. **编号即发起**：CR / CVS CR / Core BPW 导入有效编号时 status 置 `initiated`
   （CR/CVS 显示 Created，BPW 显示 Initiated），绝不算完成（录入≠完成不变）；
   已有 45 行 CR 编号重导后同样变为"已创建"。Portfolio 的 BPW 筛选按既有设计把
   initiated 归入 "In progress" 档（workflow-core.js `portfolioStatus`），无需加档。

## 实现落点

- `frontend/public/workflow-core.js`：新增纯函数 `splitBpwCell(cell)`（按换行/斜杠拆段，
  抽编号 `BPW[\s-]*\d{2}-\d{3,}` 与文字标签：core → Core，其他文字标签 → OEM，
  无标签 → Core 并计数）；`applyStatusRules` 警告文案去掉已过时的 "status is missing"。
- `frontend/public/improvements.js`（`prepareImport`）：
  - `importedAliases.tech` 追加 `oemtech` → "OEM - Tech" 列落主数据 `tech` 字段
    （样板主数据网格已有 "Tech" 行，编辑/导出/新建默认自动继承，零 UI 改动）；
  - `actionAliases` 支持 `tab|act` 复合键，`CVS CR|Input CR number for CVS on Windchill`
    映射列 `CVS CR`（不误伤同 tab 的适用性动作）；
  - 规则动作导入有效编号且无 `— Approval status` 列时 status 置 `initiated`；
  - BPW 专属拆分段（Core BPW "Input BPW number" / OEM BPW "Identify BPW number"），
    占位值（Pending/TBD）不写值、沿用 unresolved 警告；
  - 歧义清单清空（机制保留给将来无法映射的列）。
- 测试：`frontend/tests/workflow-core.test.ts` 新增 `splitBpwCell` 5 组用例；
  `frontend/e2e/verification.spec.ts` 新增端到端用例（带标签拆分、无标签默认 Core
  与警告、占位保护、OEM - Tech 落主数据、持久化往返）。
- 重导驱动：`frontend/scripts/reimport-workspace.mjs`（可复用）——在真实页面内
  重放 `importSource` 原文行（显式注入原 Project ID 与 Created，importSource 原文
  回写），走 preview → applyImport → PUT 链路；写库前 SQLite 在线备份，事后输出
  before/after/report。

## 重导记录（2026-09-23）

- 备份：`.demo/before-reimport-bpw-mapping-2026-09-23.db`（revision 3）；
  明细：`.demo/reimport-bpw-mapping-2026-09-23/{before,after,report}.json`。
- 46/46 导入项目处理、0 阻断；revision 3 → 4；`PRAGMA quick_check` ok。
- Core BPW 填值 12、OEM BPW 填值 1（Ford/STLA 行）、CVS CR 填值 4、
  `tech` 填值 46、initiated 状态 61（CR 45 + Core BPW 12 + CVS 4）、
  "assumed Core" 留痕警告 11 行。
- 完成数 5 → 5（无新增完成、无丢失）；项目/动作 ID 与依赖、6 个 TR- 示例项目、
  团队与日期历史全部保持。

## 后期修改通道

- **手动**：项目详情里 Core BPW / OEM BPW / CVS CR 的编号输入框、行内状态下拉、
  主数据 Tech 字段均可直接编辑；归错 Core/OEM 就是把号在两个输入框间挪。
- **重导**：下次重导同一来源文件时这三列按文件原文重算（手改会被文件值覆盖）；
  领导答复后按确认口径更新 `splitBpwCell` 路由规则再重导即可批量修正。
- 遗留：BPW 英文全称（Business Process Workflow 候选）仍待业务确认（原 Q1 一部分）；
  6 行 External 无标签编号的 Core 假设待领导核对（警告已逐行留痕）。
