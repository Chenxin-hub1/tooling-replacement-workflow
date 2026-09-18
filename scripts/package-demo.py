"""将当前 UI 打包为自包含演示 HTML，不读取业务数据库。"""

import base64
import re
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / "frontend/dist"
out = root / ".demo/presentation"
out.mkdir(parents=True, exist_ok=True)
html = (source / "index.html").read_text()

adapter = """
const BACKUP_KEY = 'trw-presentation-unused-backup';
const contentKey = snap => JSON.stringify({...snap, savedAt: ''});
autosave = function () {
  STORAGE_OK = false;
  const label = document.getElementById('saveLbl');
  if (label) label.textContent = 'Demo only · Changes last until reload';
};
for (const event of ['click', 'change']) {
  document.addEventListener(event, () => queueMicrotask(autosave));
}
resetDemo = function () {
  if (confirm('Reset this presentation to its original demo data?')) location.reload();
};
seed();
refreshUsers();
render();
"""


def script(match):
    name = match[1].lstrip("/")
    code = adapter if name == "workspace.js" else (source / name).read_text()
    if name == "prototype.js":
        code = code.replace(
            "Everything you change (projects, uploads, people, rules) is autosaved on the server and comes back when you reopen this page.",
            "Presentation only. Changes last until reload; download a workspace file to keep them.",
        )
    return (
        "<script>" + re.sub(r"</script", r"<\\/script", code, flags=re.IGNORECASE) + "</script>"
    )


def stylesheet(match):
    path = match[1] or match[2]
    css = (source / path.lstrip("/")).read_text()

    def asset(m):
        data = base64.b64encode((source / m[1].lstrip("/")).read_bytes()).decode()
        return f"url(data:font/ttf;base64,{data})"

    css = re.sub(r"url\((/vendor/[^)]+)\)", asset, css)
    return "<style>" + css + "</style>"


html = re.sub(r'<script src="([^"]+)"></script>', script, html)
html = re.sub(
    r'<link href="([^"]+)" rel="stylesheet">|<link rel="stylesheet" href="([^"]+)">',
    stylesheet,
    html,
)
html = html.replace(
    "<title>Tooling Replacement Workflow</title>",
    "<title>Tooling Replacement Workflow · Demo</title>",
)
html = html.replace(
    "<body>",
    '<body><div style="padding:8px 16px;background:#E4ECF7;color:#1F4E8C;font:13px system-ui">DEMO · 6 sample projects · Real data pending confirmation · Email / Teams preview only · Changes reset on reload</div>',
)
file = out / "Tooling-Workflow-Demo.html"
file.write_text(html)
(out / "index.html").write_text(html)
readme = out / "展示说明.txt"
readme.write_text(
    "双击 Tooling-Workflow-Demo.html 即可在浏览器展示，无需安装。\n包含 6 个示例项目，未接入真实数据；邮件/Teams 仅预览。\n演示修改刷新即重置，不会写入正式数据库；需要保留可在 Admin 下载工作区文件。\n建议演示顺序：Portfolio → 项目详情 → My actions → Management → Reminders。\n网站链接需将 index.html 放入可访问的静态网站托管。\n"
)
with zipfile.ZipFile(
    out / "Tooling-Workflow-Demo.zip", "w", zipfile.ZIP_DEFLATED
) as archive:
    archive.write(file, file.name)
    archive.write(readme, readme.name)
print(file)
print(f"{file.stat().st_size:,} bytes")
