# 前端：原样板发布

当前入口遵循用户指定的 `.design/reference/tooling-replacement-workflow_3459.html`，不使用独立设计的 React 页面。

`bun run dev` / `bun run build` 首先执行 `scripts/prepare-prototype.mjs`：读取仓库样板，复制原始脚本到 `public/prototype.js`，原始 HTML/CSS 生成 `index.html`，然后由 Vite 提供服务或构建。生成器调整资源路径、初始化、服务器保存说明、安全转义及已确认的四阶段流程。生成文件应通过构建更新；业务变化遵循已接受的评审范围。

`public/workspace.js` 在全部样板声明初始化后加载服务器工作区，替代浏览器 localStorage 自动保存与演示重置。使用版本号进行串行提交，保存失败保留当前页面并提示；没有读到服务器数据时不显示可编辑工作区，不自动覆盖服务器。

`public/vendor/` 包含官方 SheetJS 0.20.3（含已知安全漏洞修复） 和 IBM Plex Sans 字体。页面加载不依赖第三方 CDN。原样板 SHA-256 记录在 `public/reference-version.json`。

React 实现已退役并从仓库删除，历史可从 Git 查询；`e2e/workflow.spec.ts.legacy` 不参与验证。当前浏览器用例覆盖样板保留布局、v2 流程、数据往返及安全回归。

开发 API 默认代理 `http://127.0.0.1:8000`；可用 `API_PROXY_TARGET` 覆盖。浏览器截图证据写入 `.design/screenshots/parity/`。

## 用户随后授权的优化

`public/improvements.js`、`workflow-core.js`、`mobile.css` 提供导入预览、实际日期/状态校验和手机端优化。生成器也包含通知预览文案、编号和同步焦点修正。原始样板不改；当前不再要求已授权修改的文案/移动端与原样板逐像素一致。未变的桌面视图继续截图验证。
