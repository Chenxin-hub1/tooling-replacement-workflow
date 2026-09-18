# 前端：原样板发布

当前入口遵循用户指定的 `.design/reference/tooling-replacement-workflow_3459.html`，不使用独立设计的 React 页面。

`bun run dev` / `bun run build` 首先执行 `scripts/prepare-prototype.mjs`：读取仓库样板，复制原始脚本到 `public/prototype.js`，原始 HTML/CSS 生成 `index.html`，然后由 Vite 提供服务或构建。生成器只调整本地资源路径、初始化时机和服务器保存说明。禁止手工修改生成文件；调整业务 UI 前先征求用户对样板变更的明确指示。

`public/workspace.js` 在全部样板声明初始化后加载服务器工作区，替代浏览器 localStorage 自动保存与演示重置。使用版本号进行串行提交，保存失败保留当前页面并提示；没有读到服务器数据时不显示可编辑工作区，不自动覆盖服务器。

`public/vendor/` 包含原版本 SheetJS 0.18.5 和 IBM Plex Sans 字体。页面加载不依赖第三方 CDN。原样板 SHA-256 记录在 `public/reference-version.json`。

`src/` 中的 React 实现和对应单元测试是历史实现；`e2e/workflow.spec.ts.legacy` 是旧界面测试，不参加当前浏览器验证。当前测试是 `e2e/prototype.spec.ts`。原接口生成工具保留，只有维护旧 API 时才需要运行 `bun run generate`。

开发 API 默认代理 `http://127.0.0.1:8000`；可用 `API_PROXY_TARGET` 覆盖。浏览器截图证据写入 `.design/screenshots/parity/`。

## 用户随后授权的优化

`public/improvements.js`、`workflow-core.js`、`mobile.css` 提供导入预览、实际日期/状态校验和手机端优化。生成器也包含通知预览文案、编号和同步焦点修正。原始样板不改；当前不再要求已授权修改的文案/移动端与原样板逐像素一致。未变的桌面视图继续截图验证。
