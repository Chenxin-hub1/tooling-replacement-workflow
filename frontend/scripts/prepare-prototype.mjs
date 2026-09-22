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
  "/vendor/xlsx.full.min.js?v=0.20.3",
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
replaceOnce("(a.value?'background:var(--g-soft);", "(a.done?'background:var(--g-soft);");
replaceOnce("Enter &amp; complete", "Update action");
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
// 数值与注释改为块级堆叠：任何字体/缩放下两行都不可能叠字（真实数据在部分浏览器上出现过叠加）。
// 行盒高度按单元格 13px×1.45 换算（12px 字号 ×1.5708em），与原 <br> 渲染逐像素一致。
replaceOnce(
  "<td class=\"num\">${s.leadTotal} d${s.adjusted?`<br><span class=\"adj hint\">${s.adjusted} adjusted</span>`:''}</td>",
  "<td class=\"num\">${s.leadTotal} d${s.adjusted?`<span class=\"adj hint\" style=\"display:block;line-height:1.5708em\">${s.adjusted} adjusted</span>`:''}</td>",
);
replaceOnce(
  "<td>${fmt(s.target)}${s.undated?`<br><span class=\"hint\">${s.undated} undated</span>`:''}</td>",
  "<td>${fmt(s.target)}${s.undated?`<span class=\"hint\" style=\"display:block;line-height:1.5708em\">${s.undated} undated</span>`:''}</td>",
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
// ---------- P0 安全修复（2026-09-21）：HTML 转义 ----------
// 原样板把 Excel 导入与人工输入的自由文本直接插进 innerHTML（${p.desc} 等），单元格内容
// 含 < > " ' 时可拆开标记甚至执行脚本。此处为全部数据插值点包上转义：escHtml 用于文本/属性值，
// escJs 用于内联事件属性里嵌的 JS 字符串（额外处理引号、反斜杠、换行，防止拆开属性或语句）。
// 每条规则断言出现次数，样板一变即构建失败，转义不会悄悄丢失。
replaceOnce(
  "/* ---------- helpers ---------- */",
  String.raw`/* ---------- helpers ---------- */
// 构建脚本注入的转义助手（避开样板 openRemind 里已有的局部变量 esc）：escHtml 转义 HTML 文本/属性，
// escJs 保护内联事件属性里嵌的 JS 字符串（引号、反斜杠、换行）。
const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const escJs = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/[\r\n]+/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");`,
);
function replaceExact(oldText, newText, expected) {
  const count = html.split(oldText).length - 1;
  if (count !== expected)
    throw new Error(`Reference changed: ${count}x instead of ${expected}x -- ${oldText}`);
  html = html.split(oldText).join(newText);
}
function wrapEvery(fragment, expressions, wrap, expected) {
  let wrapped = fragment;
  for (const expression of expressions)
    wrapped = wrapped
      .split("${" + expression + "}")
      .join("${" + wrap + "(" + expression + ")}");
  replaceExact(fragment, wrapped, expected);
}
// 内联事件属性里的 ID/人名/职能名：转义后必须仍是合法 JS 字符串。
const jsqRules = [
  ["openProject('${p.id}')", ["p.id"], 1],
  ["deleteProject('${p.id}')", ["p.id"], 1],
  ["openAction('${a.id}')", ["a.id"], 2],
  ["openRemind('${a.id}')", ["a.id"], 1],
  ["deleteAction('${a.id}')", ["a.id"], 1],
  ["toggleAdmin('${n}',this.checked)", ["n"], 1],
  ["removePerson('${f}','${n}')", ["f", "n"], 1],
  ["setFnLabel('${f}',this.value)", ["f"], 1],
  ["toggleRequired('${f}',this.checked)", ["f"], 1],
  ["deleteFunction('${f}')", ["f"], 1],
  ["W.team['${f}']=this.value", ["f"], 1],
];
// 文本与属性值插值：包 escHtml()。数组为 [片段原文, 片段内要转义的表达式, 出现次数]。
const escRules = [
  ['<td><b>${p.id}</b><br><span class="muted">${p.pn} · ${p.desc}</span></td>', ["p.id", "p.pn", "p.desc"], 1],
  ['<td>${p.plant}<br><span class="muted">${p.bu}</span></td>', ["p.plant", "p.bu"], 1],
  ["<td>${p.owner}</td>", ["p.owner"], 1],
  ['${s.next.tab}<br><span class="muted">${fmt(s.next.due)}</span>', ["s.next.tab"], 1],
  ['<h1>${p.id} · ${p.desc}</h1><div class="sub">${p.pn} · ${p.plant} · ${p.bu} · created', ["p.id", "p.desc", "p.pn", "p.plant", "p.bu"], 1],
  ["next: ${s.next.tab} ${fmt(s.next.due)}", ["s.next.tab"], 1],
  ["— ${a.tab} · ${a.act} <span class=\"muted\">(${a.owner})</span>", ["a.tab", "a.act", "a.owner"], 1],
  ["<b>${a.tab}</b> · ${a.act}", ["a.tab", "a.act"], 3],
  ['<br><span class="muted">${a.input}</span>', ["a.input"], 1],
  ["after ${byId(p,a.dep).tab}", ["byId(p,a.dep).tab"], 1],
  ["added by ${a.creator||'—'}", ["a.creator||'—'"], 1],
  ['<td>${a.fn}</td><td>${a.owner}<br><span class="muted">${email(a.owner)}</span></td>', ["a.fn", "a.owner", "email(a.owner)"], 1],
  ['<option value="">${a.input}</option>', ["a.input"], 1],
  [">${o}</option>", ["o"], 2],
  ['placeholder="${a.input}"', ["a.input"], 1],
  ['title="Send a reminder to ${a.owner} now"', ["a.owner"], 1],
  ['<div class="sub">${me} · ${openN} open', ["me"], 1],
  ['<td><b>${p.id}</b><br><span class="muted">${p.desc}</span></td>', ["p.id", "p.desc"], 1],
  ["const hb=(l,n,sub)=>`<div class=\"hbar\"><span>${l}${sub?`<br><span class=\"hint\">${sub}</span>`:''}</span>", ["l", "sub"], 1],
  ["<b>${m.s}</b>", ["m.s"], 1],
  ["→ ${m.to} &lt;${email(m.to)}&gt;${m.cc?` · Cc: ${m.cc} (project owner)`:''}", ["m.to", "email(m.to)", "m.cc"], 1],
  ["<b>${m.a.tab} · ${m.a.act} (${m.p.id})</b>", ["m.a.tab", "m.a.act", "m.p.id"], 1],
  ["→ ${m.to} &lt;${email(m.to)}&gt;${m.cc?` · Cc: ${m.cc}`:''} · previewed by ${m.by}", ["m.to", "email(m.to)", "m.cc", "m.by"], 1],
  ["<h2>${a.tab} · ${a.act}</h2>", ["a.tab", "a.act"], 1],
  ["${p.id} · ${PHASES[a.ph]} · owner ${a.owner} · ${a.due?'due '", ["p.id", "a.owner"], 1],
  ['<label>${a.input} <span class="req">*</span></label>', ["a.input"], 1],
  ["Remind ${a.owner}</h2>", ["a.owner"], 1],
  ["${p.id} · ${a.tab} · ${a.act} · ${a.due?(dl<0?", ["p.id", "a.tab", "a.act"], 1],
  ["→ ${a.owner} &lt;${email(a.owner)}&gt;", ["a.owner", "email(a.owner)"], 1],
  ["Hi ${a.owner.split(' ')[0]}, quick reminder on ${p.id} (${p.desc}): \"${a.act}\" ${a.due?(dl<0?`was due", ["a.owner.split(' ')[0]", "p.id", "p.desc", "a.act"], 1],
  ["Please enter the ${a.input} in the dashboard. Thanks, ${me}", ["a.input", "me"], 1],
  ["Copy project owner (${p.owner})", ["p.owner"], 1],
  ["<option ${f==='SP/BU'?'selected':''}>${f}</option>", ["f"], 1],
  ["${p.id} · new action added to the project's action plan", ["p.id"], 1],
  ['<option value="${a.id}">${a.tab} · ${a.act.slice(0,40)}</option>', ["a.id", "a.tab", "a.act.slice(0,40)"], 1],
  ["value=\"${W.d[k]||''}\"", ["W.d[k]||''"], 1],
  ["<option ${W.team[f]===n?'selected':''}>${n}</option>", ["n"], 1],
  ['<span class="hint">${email(me)}</span>', ["email(me)"], 1],
  ["<option ${p.team[INITIATOR_FN]===n?'selected':''}>${n}</option>", ["n"], 1],
  ["<option ${p.team[f]===n?'selected':''}>${n}</option>", ["n"], 1],
  ['<td class="muted">${a.fn}</td>', ["a.fn"], 1],
  ["${p.team['BU Buyer']}<br><span>${email(p.team['BU Buyer'])}</span>", ["p.team['BU Buyer']", "email(p.team['BU Buyer'])"], 1],
  ['<span>${email(p.team[f])}</span>', ["email(p.team[f])"], 1],
  ['<tr><td>${n}</td><td>${f}</td><td class="muted">${email(n)}</td>', ["n", "f", "email(n)"], 1],
  ["<option>${f}</option>", ["f"], 1],
  [">${x}</option>", ["x"], 7],
  ['value="${F.q}"', ["F.q"], 1],
  ['value="${f}"', ["f"], 1],
  ["value=\"${tr?tr[1]:''}\"", ["tr?tr[1]:''"], 1],
  ['value="${me}"', ["me"], 1],
  ["value=\"${p.bu||''}\"", ["p.bu||''"], 1],
  ["value=\"${p.team['SP/BU']||''}\"", ["p.team['SP/BU']||''"], 1],
];
// 结构性改写：带 HTML 回退值的插值改为条件表达式，只转义数据本身。
const escRewrites = [
  ['value="${String(p[k]||\'\').replace(/"/g,\'&quot;\')}"', 'value="${escHtml(String(p[k]||\'\'))}"', 1],
  ['value="${(a.comment||\'\').replace(/"/g,\'&quot;\')}"', 'value="${escHtml(a.comment||\'\')}"', 1],
  ['value="${(a.value||\'\').replace(/"/g,\'&quot;\')}"', 'value="${escHtml(a.value||\'\')}"', 1],
  ["${a.value?'<b>'+a.value+'</b>':a.input}", "${a.value?'<b>'+escHtml(a.value)+'</b>':escHtml(a.input)}", 1],
  ["<span class=\"hint\">${W.team[f]?email(W.team[f]):'&nbsp;'}</span>", "<span class=\"hint\">${W.team[f]?escHtml(email(W.team[f])):'&nbsp;'}</span>", 1],
  ["<td>${a.owner||'<span class=\"req\">unassigned</span>'}</td>", "<td>${a.owner?escHtml(a.owner):'<span class=\"req\">unassigned</span>'}</td>", 1],
  ["${p[k]||'<span class=\"muted\">—</span>'}", "${p[k]?escHtml(p[k]):'<span class=\"muted\">—</span>'}", 1],
  ["<span>${l}</span>${p.team[f]||'<span class=\"req\">not assigned</span>'}", "<span>${l}</span>${p.team[f]?escHtml(p.team[f]):'<span class=\"req\">not assigned</span>'}", 1],
];
for (const [fragment, expressions, expected] of jsqRules)
  wrapEvery(fragment, expressions, "escJs", expected);
for (const [fragment, expressions, expected] of escRules)
  wrapEvery(fragment, expressions, "escHtml", expected);
for (const [oldText, newText, expected] of escRewrites)
  replaceExact(oldText, newText, expected);

html = html.replaceAll("six phases", "four phases");

// v2：删除 Scrap / Archive，所有显示与汇总按有效阶段数计算。
replaceOnce(
  "'4. Customer Approval','5. Scrap','6. Archive'",
  "'4. Customer Approval'",
);
replaceOnce("let phase=5; for(let i=0;i<6;i++)", "let phase=PHASES.length-1; for(let i=0;i<PHASES.length;i++)");
replaceOnce("const ms=[1,2,3,4,5].map", "const ms=[1,2,3].map");
replaceOnce("let CUSTOM_SEQ=0;", "MATRIX.splice(20);\nlet CUSTOM_SEQ=0;");
// CVS CR 属 Development（原六流程的第 2 步），保持矩阵索引与依赖不变。
replaceExact("{ph:2,tab:'CVS CR'", "{ph:1,tab:'CVS CR'", 2);
replaceOnce("repeat(6,1fr)", "repeat(4,1fr)");

replaceExact("<span>${l}", "<span>${escHtml(l)}", 4);
replaceExact("<label>${l}", "<label>${escHtml(l)}", 2);

const match = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!match) throw new Error("Prototype script not found");
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/prototype.js", import.meta.url), match[1]);
// 内容版本号：脚本一变引用即变，浏览器不会继续用缓存的旧版。
const bundleHash = createHash("sha256")
  .update(html)
  .update(readFileSync(new URL("../public/workflow-core.js", import.meta.url)))
  .update(readFileSync(new URL("../public/improvements.js", import.meta.url)))
  .update(readFileSync(new URL("../public/workspace.js", import.meta.url)))
  .digest("hex")
  .slice(0, 10);
html = html.replace(
  match[0],
  `<script src="/prototype.js?v=${bundleHash}"></script>\n<script src="/workflow-core.js?v=${bundleHash}"></script>\n<script src="/improvements.js?v=${bundleHash}"></script>\n<script src="/workspace.js?v=${bundleHash}"></script>`,
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
