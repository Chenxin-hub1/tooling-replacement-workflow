# Excel 导入与工作区恢复

Portfolio 保留样板的 Import template、Upload Excel 和导出入口。上传后进入 Review Excel import，预览不写入工作区。核对问题后勾选确认，再 Apply import；侧栏显示 Autosaved on server 才是服务器保存成功。

缺失创建日期、重复工具身份、缺少零件号/描述等会阻止导入。不要为消除提示而猜日期或职责。PEND/TBD 等占位值不会标成完成；混合日期和未明确 BPW 类型保留原文待核对。原始列与值保存在项目详情 Imported data review 和工作区 JSON 中，重复 Status 列也不丢弃。

没有 Project ID 的新记录从零件/工具/穴数/PPAP 身份生成标识；再次导入应保留导出的 Project ID，尤其是身份字段需要修改时。缺少人员保持未分配；提供的人员会加入对应职能选项，便于后续编辑。

Portfolio 导出 `Portfolio`、`Status`、`Actions`、`Teams`；项目导出 `Project`、`Status`、`Action plan`。筛选影响 Portfolio 导出范围。Excel 是可读业务报表，不保证携带全部调整交期、模板与来源信息；完整恢复使用 Admin 中的 Save/Load workspace file。

当前真实 Excel 尚未导入。已明确的字段/状态规则及仍待核对内容见 [优化记录](optimization-2026-09-15.md) 和 [真实数据核对](real-data-readiness.md)。
