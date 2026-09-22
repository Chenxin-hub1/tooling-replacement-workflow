# Excel 导入与工作区恢复

Portfolio 保留样板的 Import template、Upload Excel 和导出入口。上传后进入 Review Excel import，预览不写入工作区。核对问题后勾选确认，再 Apply import；侧栏显示 Autosaved on server 才是服务器保存成功。

缺失创建日期、重复工具身份、缺少零件号/描述等会阻止导入。不要为消除提示而猜日期或职责。PEND/TBD 等占位值不会标成完成；混合日期和未明确 BPW 类型保留原文待核对。原始列与值保存在项目详情 Imported data review 和工作区 JSON 中，重复 Status 列也不丢弃。

没有 Project ID 的新记录从零件/工具/穴数/PPAP 身份生成标识；再次导入应保留导出的 Project ID，尤其是身份字段需要修改时。缺少人员保持未分配；提供的人员会加入对应职能选项，便于后续编辑。

Portfolio 导出 `Portfolio`、`Status`、`Actions`、`Teams`；项目导出 `Project`、`Status`、`Action plan`。筛选影响 Portfolio 导出范围。Excel 是可读业务报表，不保证携带全部调整交期、模板与来源信息；完整恢复使用 Admin 中的 Save/Load workspace file。

真实 Excel 已于 2026-09-18 导入 46 条；待业务确认的映射不在此次核验中重导。已明确的字段/状态规则及仍待核对内容见 [优化记录](optimization-2026-09-15.md) 和 [真实数据核对](real-data-readiness.md)。


v2 导出新增动作级 Approval status、Original date、Current date、Completed date，首表回导时可恢复这些字段。原始日期与现存值冲突会阻止应用，应在 Admin 修正并留痕。明细表可查原始日期修正记录；完整审计历史和退役动作以工作区 JSON 保存。当前活跃流程只包含四阶段、20 项标准动作及项目自定义项。

补齐规则（2026-09-22）：普通编号、适用性与目标日期导入仅录入信息；仅有效的 Completed date 或显式批准完成动作。已有完成内容发生变化后重新开放，审批需重新确认。六处关键日期首表增加 `— Date history` JSON 列，动作表增加 `Current date history`；新项目恢复合法历史，已有项目保留本地历史并追加导入变更。空 Current date 列可明确清空当前日期，原始日期不变。

历史重导（用户新指示）：取消旧完成状态豁免。即使编号/日期没有变化，本次文件涉及的动作也重新按当前规则判断；未给有效完成日期或最终批准的记录重新开放。当前明确最终批准与原值都没变时保留合法旧完成日期，避免把重导日当作批准日。未涉及的项目/动作不改写。
