# v2 Phase-4 — Portfolio 状态筛选

新增 PPAP Status、BPW、Pre Grain、AAR 四个筛选，组合使用，Clear 一并重置；筛选同时影响 Portfolio Excel 导出范围。

- PPAP：未填 / Draft / Interim approved / Full approved。
- BPW：取 Core BPW 编号动作的审批状态，未填为 Not initiated，initiated 与 in_progress 合并为 In progress，approved 为 Completed。
- Pre Grain / AAR：先读取适用性动作的 Not applicable，否则由凭证动作映射为 Not initiated / In progress / Approved。
- 不从历史完成日期反推已核实的审批状态；重导项目按当前有效完成/审批证据重算，不能从旧 done 反推批准。
- 规则测试覆盖适用性、空值、中间状态与批准，浏览器覆盖组合筛选及 Clear。
