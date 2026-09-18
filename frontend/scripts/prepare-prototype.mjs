import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const reference = new URL(
  "../../.design/reference/tooling-replacement-workflow_3459.html",
  import.meta.url,
);
let html = readFileSync(reference, "utf8");
const sourceHash = createHash("sha256").update(html).digest("hex");
function replaceOnce(old, replacement) {
  if (html.split(old).length !== 2)
    throw new Error(`Reference changed: ${old}`);
  html = html.replace(old, replacement);
}
// 仅替换资源路径、初始化时机和保存说明；原 CSS、DOM 与交互函数保留。
replaceOnce(
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
  "/vendor/fonts.css",
);
replaceOnce(
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "/vendor/xlsx.full.min.js",
);
replaceOnce(
  "if(!loadAutosave()) seed();",
  "// Workspace is loaded from the server after all declarations initialize.",
);
replaceOnce("\nrefreshUsers();\n", "\n");
replaceOnce("\nrender();\n</script>", "\n</script>");
replaceOnce(
  "Everything you change (projects, uploads, people, rules) is autosaved in this browser and comes back when you reopen the file here.",
  "Everything you change (projects, uploads, people, rules) is autosaved on the server and comes back when you reopen this page.",
);
// 已获用户授权的业务修正；原始样板保留不动。
replaceOnce(
  "const TODAY = new Date('2026-09-12');",
  "const TODAY = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));",
);
replaceOnce(
  "const id='TR-2026-0'+(30+projects.length);",
  "const id=Workflow.nextId(projects,d2s(TODAY));",
);
replaceOnce("Create project and send assignments", "Create project");
replaceOnce(
  "setTimeout(()=>document.getElementById('aVal').focus(),50);",
  "document.getElementById('aVal').focus();",
);
replaceOnce(
  "setTimeout(()=>document.getElementById('naTab').focus(),50);",
  "document.getElementById('naTab').focus();",
);
replaceOnce(
  "created:TODAY,team:{...W.team}",
  "created:new Date(TODAY),team:{...W.team}",
);
replaceOnce(
  "{day:'2-digit',month:'short',year:'numeric'}",
  "{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}",
);
html = html
  .replaceAll(
    "assignment emails queued",
    "assignment preview prepared (not sent)",
  )
  .replaceAll("assignment email to ", "assignment preview for ")
  .replaceAll(
    "Assignment email goes to the owner as soon as the item is added.",
    "Assignment preview only. No email or Teams message is sent.",
  )
  .replaceAll("Send reminder</button>", "Preview reminder</button>")
  .replaceAll(
    "Sent immediately, independent of the automatic schedule. Logged on the action.",
    "Preview only — no email or Teams message will be sent.",
  )
  .replaceAll("Reminder sent to ", "Reminder preview for ")
  .replaceAll(
    "sent to ${owners.join(', ')}",
    "previewed for ${owners.join(', ')} (not sent)",
  )
  .replaceAll(" · sent by ", " · previewed by ")
  .replaceAll("reminded ${fmt(a.lastRemind)}", "previewed ${fmt(a.lastRemind)}")
  .replaceAll("Last manual reminder", "Last reminder preview")
  .replaceAll("Automatic send list", "Automatic reminder preview")
  .replaceAll("Manual reminders sent today", "Manual reminder previews today");
const match = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!match) throw new Error("Prototype script not found");
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/prototype.js", import.meta.url), match[1]);
html = html.replace(
  match[0],
  '<script src="/prototype.js"></script>\n<script src="/workflow-core.js"></script>\n<script src="/improvements.js"></script>\n<script src="/workspace.js"></script>',
);
html = html.replace(
  "</head>",
  '<link rel="stylesheet" href="/mobile.css">\n</head>',
);
writeFileSync(new URL("../index.html", import.meta.url), html);
writeFileSync(
  new URL("../public/reference-version.json", import.meta.url),
  JSON.stringify(
    { source: "tooling-replacement-workflow_3459.html", sha256: sourceHash },
    null,
    2,
  ),
);
