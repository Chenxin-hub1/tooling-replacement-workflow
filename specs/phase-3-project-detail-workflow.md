# Phase-3：详情、动作与新建向导

Status: awaiting-acceptance

## 唯一实现基准

[tooling-replacement-workflow_3459.html](../.design/reference/tooling-replacement-workflow_3459.html)。2026-09-15 用户明确要求 UI 和功能完全一致，不得独立设计。

## 范围

项目详情的时间线、Red flags、主数据/团队编辑、逐项输入、完成弹窗、手动提醒、Lead time、按阶段加项、追加模板、删除权限与三步向导完全沿用样板。模板初始 31 项。服务器保存全工作区，备注、必填职能和模板追加等不触发 render 的修改也必须保存。

仅允许服务器接入必需的资源路径、初始化顺序、保存说明与失败提示差异。样板固定日期、提醒预览和人员切换行为保留。

## 验证

原始样板与发布页面同浏览器截图比对（仅统一保存说明，容许最多 5 个抗锯齿像素差异），并执行浏览器持久化与 Excel 测试。完整证据见 `handoff-tooling-replacement-workflow.md`。

## 用户批准的优化（覆盖前述原样板保留边界）

本轮已授权实时日期/状态校验、Excel 预览与来源保留、保存可靠性、手机端优化；通知改为明确预览，登录暂不启用。以 `docs/optimization-2026-09-15.md` 为当前行为记录。真实文件歧义待核对，不导入。
