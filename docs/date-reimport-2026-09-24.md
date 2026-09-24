# 源表重导记录（2026-09-24，日期格修复后）

## 背景

2026-09-24 整体核查发现：浏览器导入真实 Excel 日期单元格时，SheetJS 给出本地零点 Date，经 `toISOString()` 在东八区早一天。修复为 `importExcel` 的 `sheet_to_json` 加 `UTC:true`（`frontend/public/improvements.js`），e2e 在 Asia/Taipei 与 America/Los_Angeles 两个时区各验证一次。

对照源表 `Master Changes and OIL 2026 - Test Tool.xlsx`（用户 OneDrive 桌面，SHA256 `962dc36f…4ddf`）核对库内 importSource 原始值：55 个真实日期格中 51 个早一天，4 个所在列名在源表带尾随空格（`TIER 2 SOP`）因此当时未按列名匹配，实际同样早一天。

## 执行方式

- 备份：`.demo/before-reimport-source-dates-2026-09-24.db`（SQLite 在线备份）。
- 本机服务 `TOOLING_PORT=8765`，dist 已含修复；Playwright 无头 Chromium（系统时区 Asia/Taipei）走真实页面：Upload Excel → `importExcel` → 预览设创建日期 2026-09-18（`recheckImport`）→ 勾选已复核 → Apply import。服务端 schema 校验、revision CAS 与滚动快照照常。
- 按行号注入原 `Project ID` 列后再导（与 09-23 重导相同）：直接导源表时 6 行会成为新项目——2026-09-22 升级的 SheetJS 把单元格内 `\r\n` 读成 `\n`，多行 PPAP ID 的工具身份哈希与 09-18 首导不再一致；去掉换行差异后源表与库内原始值 0 处不同，文件本身未变。importSource 写库前去掉了注入列，仍为源表原有 41 列。
- 产物：`.demo/reimport-source-dates-2026-09-24/{before,plan,after,report}.json`。

## 核验结果

| 项目 | 结果 |
| --- | --- |
| 工作区修订 | 5 → 6 |
| 项目数 / 编号 / 动作编号与依赖 / 创建日期 | 46，全部不变 |
| 完成动作 | 5 → 5（导入规则未把任何动作标成完成或重开） |
| importSource 日期格 | 55 个与源表逐一相等 |
| 动作值变化 | 38 处：31 处恰好 +1 天；7 处仅 `\r\n` → `\n`（多行 PPAP ID、BPO） |
| 项目字段变化 | `plant` 7 处、`po` 1 处，均仅 `\r\n` → `\n` |
| dateLog | 16 个双日期动作追加一条 import 来源的记录（旧偏移值 → 正确值） |
| 数据库 | `PRAGMA quick_check` ok；快照 `backups/workspace/workspace-20260924-064758-r6.json` |

## 待处理

1. ~~16 个双日期动作的原始日期仍是旧偏移值~~ 已处理（用户执行 `frontend/scripts/fix-orig-dates-2026-09-24.mjs`）：按 Admin "Correct original" 同一写法，16 条 `orig` 改为当前值，`origLog` 各留一条 `by: System — UTC date-cell fix 2026-09-24` 的记录；修订 6 → 7，`orig !== value` 的双日期动作为 0，产物 `orig-corrections.json` / `after-orig-fix.json`。数据库主文件已合并 WAL，quick_check ok。
2. **工具身份哈希对换行符敏感**：再次直接导入源表时，6 个多行 PPAP ID 行会变成新项目。导入前请在源表加 `Project ID` 列（导出的首表自带），或后续在代码里对身份字段做换行归一化并同步迁移既有编号。
3. 提交与部署：本地库已更新，尚未提交；服务器按 `docs/deployment.md` 的 Docker 步骤更新代码与数据卷。
