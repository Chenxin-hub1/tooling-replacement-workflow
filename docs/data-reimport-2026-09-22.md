# 历史数据按新规则重导（2026-09-22）

用户明确要求“重新导入数据重新按照新规则来”，本次取消历史完成状态豁免并已写入本地 `backend/tooling.db`。远端部署、Git 提交和推送未执行。

原 Excel 当前不可访问；46 条项目的全部 41 列原文完整保存在 importSource。重导直接调用当前前端 prepareImport，逐行显式使用原 Project ID 与创建日期，保留原 importSource（包括行号、表头和值）。未推测 BPW / CVS CR / OEM-Tech 的歧义映射。

## 写入结果

| 项目 | 结果 |
| --- | --- |
| 工作区项目 | 52，含 46 个导入项目与 6 个其他项目 |
| 导入项目完成动作 | 198 → 5 |
| 重新开放 | 193：CR 45、PPAP ID 37、BPO 27、Change 46、PPAP Draft/Interim 38 |
| 保留完成 | FOT 1、PPAP Samples 2（原文 Completed 加实际日期）；PPAP Full approved 2 |
| 完成日期 | 上述 5 项全部保留原日期，不改为重导日 |
| 完整性 | 460 个映射资料值、1614 个动作 ID 和依赖、人员、备注链接、历史与来源原文均保留 |
| 活跃/退役动作 | 1042 / 572；退役动作保留存档 |
| 数据版本 | revision 2 → 3 |

6 个其他项目在标准四阶段/CVS 位置/原始日期升级后未修改业务状态。新规则只重算明确导入的动作；同值重导也不再继承缺乏依据的旧完成状态。重复执行不会再次改变业务状态。

## 备份与验证

- 写入前完整 SQLite 在线备份（包含 WAL）：`.demo/before-new-rule-reimport-2026-09-22.db`。
- 前后工作区 JSON 与摘要：`.demo/reimport-new-rules-2026-09-22/{before,after,report}.json`。
- 候选数据经 WorkspaceSnapshot 校验；事务内核验原 revision 与原 JSON SHA256 后写入，防止覆盖并发更改。
- 写入后读取核验 revision、内容 hash 和完整 schema；SQLite quick_check 为 ok。
- 完整代码检查通过：159 pytest、55 Vitest、36 Playwright；Ruff、ty、Prettier、语法检查与生产构建通过。
- 本次仅更新工作区文档与版本；数据库结构增量迁移由新版本启动时正常执行。

## 原始日期说明

原始日期用于保留最初计划承诺，改期更新当前日期并追加历史。例如最初 4 月、调整至 11 月，仍可看见两者。管理员可以纠正错误原始日期并保留修正记录。本次用户询问设计原因，未要求取消该规则。
