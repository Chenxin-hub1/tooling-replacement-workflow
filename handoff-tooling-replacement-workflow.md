# Tooling Replacement Workflow — 当前交接

## 用户要求

桌面以指定 `tooling-replacement-workflow_3459.html` 为样板，不独立设计。用户随后授权优化日期/状态、真实导入、保存可靠性和移动端。

本轮不启用登录；邮件/Teams 需求未确定，保留预览但不真实发送。真实数据必须待功能和歧义核对完成后才导入。只在本机完成，**暂不上传 Git**。

## 当前实现

入口从 `.design/reference/tooling-replacement-workflow_3459.html` 生成；SHA-256 为 `8989e9c5539e167854057427b15fe0bff3f9e73c451baa86232a88863955ffd1`，原文件未改。保留样板桌面布局、31 项初始模板和 6 个示例项目。字体与 SheetJS 随项目分发。

- `frontend/scripts/prepare-prototype.mjs`：生成入口，应用明确授权的日期、文案、编号和焦点修正。
- `frontend/public/improvements.js`：业务校验、导入预览/隔离提交、日期刷新、来源核对与备份下载。
- `frontend/public/workflow-core.js`：可单测的日期/状态/编号规则。
- `frontend/public/mobile.css`：仅小屏布局覆盖。
- `frontend/public/workspace.js`：服务器自动保存、版本冲突、重试和本地未保存备份。
- `backend/app/api/workspace.py`：完整工作区读取/写入，幂等重试；普通 HTTP 的工具身份计算后备接口不保存数据。

SQLite `workspaces` 表是当前 UI 唯一业务数据源；迁移 0002 新增该表。旧 React `src/`、规范化项目和旧 Excel API 留作历史实现，不与当前页面混用。`backend/tooling.db` 未用于本轮测试；测试用临时库，本机预览用 `.demo/tooling.db`。

## 已完成的优化

日期随今天刷新、实际完成日期校验、占位值不标完成、拓扑依赖排期、进度不误报 100%、编号防重复、提醒间隔校验、移除延迟抢焦点、手机端防溢出、服务器幂等保存、本地未保存备份恢复。

Excel 先预览后确认，保留完整原始表头/值，已明确字段自动对应；缺日期和重复身份阻止导入，BPW 等歧义保留待核对，不填演示责任人。

具体规则和扩展位置见 [优化记录](docs/optimization-2026-09-15.md)。这版有用户授权的功能与移动端差异，不宣称严格逐字逐像素复制所有页面。

## 尚未执行

真实 Excel 有 46 条记录、41 列，仅完成只读核对，未导入。缺少创建日期和业务含义的字段仍按用户要求保留待核对。未启用登录、真实消息发送、Git 推送或远程部署；这些不是本轮未获同意就擅自启用的功能。

## 验证与运行

`./scripts/check.sh`：78 项 Python 测试、Ruff/格式/ty、前端单元测试、语法/格式检查、生产构建、11 条浏览器流程。浏览器覆盖未改变桌面视图截图、跨浏览器保存、冲突、Excel 预览、向导、团队转派、提醒预览、重开、JSON 恢复、跨天日期、移动端和断网备份。

本机预览：<http://localhost:8765>。以后执行 `./scripts/start.sh` 默认端口 8000。Docker 配置保留但当前环境无 Docker，未验证容器运行。无 Git remote 或提交历史，未上传任何代码。

Phase-2/3 的优化交付等待验收；Phase-4 的真实文件接入仍待业务歧义核对，不宣称整个项目和真实数据上线已完成。

本机最终检查已通过；更新前备份 `.demo/before-optimization-2026-09-15.db`。浏览器使用实际 Today、6 个示例项目和 31 项模板，无脚本错误/外部请求。
