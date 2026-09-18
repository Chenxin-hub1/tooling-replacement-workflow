# UI 演示包

真实数据接入暂停，等待用户核对创建日期及业务字段；邮件/Teams 保留预览。

执行 `python3 scripts/package-demo.py`，从当前 `frontend/dist` 生成 `.demo/presentation/`：

- `index.html`：可放在静态网站上的自包含页面。
- `Tooling-Workflow-Demo.html`：可双击离线打开的同一页面。
- `Tooling-Workflow-Demo.zip`：离线 HTML 和展示说明。

演示包含样板 6 个项目，保留当前 UI 和规则优化；不读取工作区数据库。字体、脚本、Excel 库已内嵌。演示改动只保留至刷新，页面顶部明确提示；各访问者互不影响。正式产品仍使用服务器持久化。

验证已覆盖浏览器离线加载、五个导航页、项目详情和刷新恢复，未出现脚本错误或外部资源请求。推荐展示顺序：Portfolio → 项目详情 → My actions → Management → Reminders。

外网临时展示仅公开此演示目录，由 127.0.0.1:8766 提供静态文件；不公开正式 API 或数据库。临时链接依赖当前电脑和隧道进程持续运行。离线 HTML 可作为展示备用。

当前临时外网链接：https://scripts-ent-blond-sunday.trycloudflare.com

隧道日志和进程编号：`.demo/presentation-tunnel.log`、`.demo/presentation-tunnel.pid`；静态服务进程编号：`.demo/presentation-server.pid`。隧道重启后链接可能改变。
