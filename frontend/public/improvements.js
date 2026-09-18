/* 不重排桌面 UI；修正排期、校验、日期刷新和文件导入。 */
const escapeText = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const originalSetValue = setValue;
setValue = function (index, value) {
  if (
    Workflow.pending(value) &&
    !current.actions[index].input
      .split(" / ")
      .some(
        (choice) => Workflow.normalize(choice) === Workflow.normalize(value),
      )
  ) {
    toast(
      "Enter a confirmed value to complete this action. Pending/TBD values do not complete it.",
    );
    render();
    return;
  }
  originalSetValue(index, value);
};
const originalCompleteAction = completeAction;
completeAction = function () {
  if (
    Workflow.pending(document.getElementById("aVal").value) &&
    !actTarget.a.input
      .split(" / ")
      .some(
        (choice) =>
          Workflow.normalize(choice) ===
          Workflow.normalize(document.getElementById("aVal").value),
      )
  ) {
    toast("A pending value cannot complete an action.");
    return;
  }
  const date = document.getElementById("aDate").value;
  if (!Workflow.isoDate(date) || date > d2s(TODAY)) {
    toast("Enter a valid actual completion date, no later than today.");
    return;
  }
  originalCompleteAction();
};
// 依赖图按拓扑顺序计算，避免原样板两次扫描遗漏长链，遇环不部分修改日期。
schedule = function (project) {
  const map = new Map(project.actions.map((a) => [a.id, a]));
  const dates = new Map(),
    visiting = new Set();
  function due(action) {
    if (dates.has(action.id)) return dates.get(action.id);
    if (visiting.has(action.id))
      throw new Error("Action dependencies contain a cycle.");
    visiting.add(action.id);
    const parent = action.dep === null ? null : map.get(action.dep);
    if (action.dep !== null && !parent)
      throw new Error("An action predecessor is missing.");
    const base = parent ? parent.done || due(parent) : d2s(project.created);
    const value =
      action.lead === null || !base ? "" : d2s(addDays(base, action.lead));
    dates.set(action.id, value);
    visiting.delete(action.id);
    return value;
  }
  project.actions.forEach(due);
  project.actions.forEach((a) => (a.due = dates.get(a.id)));
};
const originalSetLead = setLead;
setLead = function (index, value) {
  if (
    value !== "" &&
    (!Number.isInteger(Number(value)) ||
      Number(value) < 0 ||
      Number(value) > 36500)
  ) {
    toast("Lead time must be a whole number between 0 and 36500 days.");
    render();
    return;
  }
  originalSetLead(index, value);
};
const originalRender = render;
// 时间线标签按实测布局：里程碑同坐标或相邻时标签会叠字（真实数据 46 个项目同日创建暴露）。
// 渲染后逐个测量标签矩形，冲突的逐层下移，时间线按需增高；贴边标签向内对齐，不探出卡片。
function layoutTimeline() {
  const timeline = document.querySelector(".timeline");
  if (!timeline) return;
  const spans = [...timeline.querySelectorAll(".ms span")];
  for (const span of spans)
    span.style.cssText = "";
  timeline.style.height = "";
  const inner = timeline.getBoundingClientRect();
  const placed = [];
  let maxLane = 0;
  spans
    .map((span) => ({ span, rect: span.getBoundingClientRect() }))
    .sort((a, b) => a.rect.left - b.rect.left)
    .forEach(({ span, rect }) => {
      let lane = 0;
      while (
        placed.some(
          (item) =>
            item.lane === lane &&
            !(rect.left >= item.right - 1 || item.left >= rect.right - 1),
        )
      )
        lane++;
      maxLane = Math.max(maxLane, lane);
      placed.push({ lane, left: rect.left, right: rect.right });
      if (lane) span.style.top = `${18 + lane * 17}px`;
      if (rect.left < inner.left - 1) {
        span.style.left = "7px";
        span.style.transform = "none";
      } else if (rect.right > inner.right + 1) {
        span.style.left = "auto";
        span.style.right = "7px";
        span.style.transform = "none";
      }
    });
  if (maxLane) timeline.style.height = `${18 + (maxLane + 1) * 17 + 16}px`;
}
render = function () {
  const now = new Date();
  TODAY.setTime(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  originalRender();
  layoutTimeline();
  document
    .querySelectorAll(".rule input[type=number]")
    .forEach((input, index) => {
      const key = ["before", "overdueEvery", "escalateAfter"][index];
      input.min = index === 1 ? "1" : "0";
      input.max = "36500";
      input.onchange = () => {
        const value = Number(input.value);
        if (
          !Number.isInteger(value) ||
          value < Number(input.min) ||
          value > 36500
        ) {
          toast("Enter a valid reminder interval.");
          render();
          return;
        }
        RULES[key] = value;
        render();
      };
    });
  if (view === "settings") {
    const note = document.querySelector(".note");
    if (note)
      note.textContent =
        "Preview mode: no email or Teams message is sent. Rules and message previews are retained; a delivery service can be connected later if required.";
  }
};
// 字体加载完成后标签宽度会变，按新宽度重排一次时间线。
if (document.fonts) document.fonts.ready.then(() => layoutTimeline());
function refreshCalendar() {
  const date = new Date();
  const next = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  if (TODAY.getTime() === next) return;
  TODAY.setTime(next);
  document.getElementById("todayLbl").textContent = fmt(d2s(TODAY));
  // 编辑期间不重绘表单，避免覆盖未保存输入；下一次 render 自动使用新日期。
  if (
    !document.querySelector(".overlay.open") &&
    !EDIT &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  )
    render();
}
setInterval(refreshCalendar, 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshCalendar();
});

/* 首表导入先构建隔离副本，预览确认后一次提交；不修改当前项目再尝试回滚。 */
let pendingImport = null;
const importedAliases = {
  ...ALIASES,
  po: [...ALIASES.po, "zftoolpo"],
  saving: [...ALIASES.saving, "savingsanualestimated"],
};
const sourceText = (value) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "").trim();
async function stableImportId(values) {
  if (!crypto.subtle) {
    // 普通局域网 HTTP 无 Web Crypto digest 时使用同源只读计算，不保存上传内容。
    const response = await fetch("/api/workspace/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) throw new Error("Tool identity could not be generated.");
    return (await response.json()).id;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return (
    "IMP-" +
    [...new Uint8Array(hash)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 24)
  );
}
async function prepareImport(rows, filename, sheetName, fallbackDate = "") {
  const originals = new Map(projects.map((p) => [p.id, p]));
  const planned = new Map(projects.map((p) => [p.id, structuredClone(p)]));
  const headers = rows[0].map(sourceText);
  const issues = [],
    seen = new Set();
  let created = 0,
    updated = 0;
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (!row.some((value) => sourceText(value))) continue;
    const get = (aliases) => {
      const at = headers.findIndex((h) =>
        aliases.includes(Workflow.normalize(h)),
      );
      return at < 0 ? "" : row[at];
    };
    const fields = Object.fromEntries(
      Object.entries(importedAliases).map(([key, aliases]) => [
        key,
        sourceText(get(aliases)),
      ]),
    );
    const issue = (message, blocking = false) =>
      issues.push({ row: index + 1, message, blocking });
    if (!fields.pn) {
      issue("Part number is missing.", true);
      continue;
    }
    const identity = [
      fields.pn,
      fields.tag,
      fields.cav,
      sourceText(get(["ppapid"])),
      sourceText(get(["toolid"])),
    ];
    const id = fields.id || (await stableImportId(identity));
    if (seen.has(id)) {
      issue(
        "Duplicate tool identity / Project ID. Assign distinct Project IDs before importing.",
        true,
      );
      continue;
    }
    seen.add(id);
    const original = originals.get(id);
    const rawCreated = get(importedAliases.created);
    const creation = rawCreated
      ? Workflow.isoDate(rawCreated)
      : original
        ? d2s(original.created)
        : fallbackDate;
    if (creation && creation > d2s(TODAY))
      issue("Creation date is in the future.", true);
    if (!creation)
      issue(
        "Creation date is missing or ambiguous. Supply a confirmed date; it will not be guessed.",
        true,
      );
    if (!fields.id)
      issue(
        "Project ID generated from part/tool/cavity/PPAP identity. Retain this ID in subsequent exports.",
      );
    if (!fields.desc && !original?.desc)
      issue("Part description is missing.", true);
    const project = original
      ? structuredClone(original)
      : {
          id,
          created: creation ? new Date(creation) : null,
          team: {},
          owner: "",
          ...Object.fromEntries(INIT_FIELDS.map(([key]) => [key, ""])),
          bu: "",
        };
    for (const [key, value] of Object.entries(fields))
      if (!["id", "created"].includes(key) && value) project[key] = value;
    if (creation) project.created = new Date(creation);
    for (const [fn, label] of [[INITIATOR_FN, "Initiator"], ...TEAM_ROWS]) {
      const name = sourceText(
        get([Workflow.normalize(fn), Workflow.normalize(label)]),
      );
      if (name && !Workflow.pending(name)) project.team[fn] = name;
    }
    project.owner = project.team[INITIATOR_FN] || project.owner || "";
    if (!original) project.actions = buildActions(project);
    else
      project.actions.forEach((a) => {
        if (!a.done && original.team[a.fn] !== project.team[a.fn])
          a.owner = project.team[a.fn] || "";
      });
    const missing = [INITIATOR_FN, ...REQUIRED_TEAM].filter(
      (fn) => !project.team[fn],
    );
    if (missing.length)
      issue(
        `Missing team roles: ${missing.join(", ")}. No demo owner will be assigned.`,
      );
    for (const action of project.actions) {
      const exact = Workflow.normalize(colName(action, project.actions));
      const actionAliases = {
        "Current Coverage": ["coverage"],
        SOP: ["tier2sop"],
        Change: ["changeinternalexternal"],
      };
      const raw = get([exact, ...(actionAliases[action.tab] || [])]);
      if (!sourceText(raw)) continue;
      const result = Workflow.actionValue(raw, action.input, d2s(TODAY));
      if (result.warning) issue(`${action.tab}: ${result.warning}`);
      // 未确认值不覆盖已完成动作；原始内容始终保存在 importSource。
      if (result.value) {
        action.value = result.value;
        if (result.done && !action.done) action.done = result.done;
      }
    }
    const ambiguous = ["BPW", "CVS CR", "OEM - Tech"].filter((name) =>
      sourceText(get([Workflow.normalize(name)])),
    );
    if (ambiguous.length)
      issue(
        `Unmapped / ambiguous columns retained for review: ${ambiguous.join(", ")}.`,
      );
    project.importSource = {
      filename,
      sheet: sheetName,
      row: index + 1,
      headers,
      values: row.map(sourceText),
    };
    project.importWarnings = issues
      .filter((i) => i.row === index + 1)
      .map((i) => i.message);
    if (creation) schedule(project);
    planned.set(id, project);
    if (original) updated++;
    else created++;
  }
  if (!created && !updated)
    issues.push({
      row: 0,
      message: "No usable project rows found.",
      blocking: true,
    });
  return { projects: [...planned.values()], issues, created, updated };
}
function showImportPreview() {
  const { plan } = pendingImport;
  const blocked = plan.issues.some((i) => i.blocking);
  document.getElementById("actBody").innerHTML = `<h2>Review Excel import</h2>
    <div class="note">${plan.created} new · ${plan.updated} updated. No changes have been applied. Original columns are retained in the workspace backup.</div>
    <div class="field"><label>Confirmed creation date for new rows without a date</label><input id="importDate" type="date" value="${escapeText(pendingImport.fallbackDate)}"><span class="hint">Leave blank when unknown. Missing dates prevent import.</span></div>
    <button class="btn secondary" onclick="recheckImport()">Recheck dates</button>
    <div style="max-height:300px;overflow:auto;margin:12px 0">${plan.issues.map((i) => `<div class="mail ${i.blocking ? "esc" : ""}"><b>Row ${i.row}</b> · ${escapeText(i.message)}</div>`).join("") || "<div>No warnings.</div>"}</div>
    <label style="display:flex;gap:8px"><input type="checkbox" id="importReviewed" onchange="document.getElementById('importApply').disabled=${blocked}||!this.checked"> I reviewed the mapping, dates and unresolved values.</label>
    <div class="mfoot"><button class="btn secondary" onclick="pendingImport=null;closeM('act')">Cancel</button><button id="importApply" class="btn" disabled onclick="applyImport()">Apply import</button></div>`;
  document.getElementById("act").classList.add("open");
}
async function recheckImport() {
  const date = document.getElementById("importDate").value;
  if (date && (!Workflow.isoDate(date) || date > d2s(TODAY))) {
    toast("Creation date must be valid and no later than today.");
    return;
  }
  pendingImport.fallbackDate = date;
  pendingImport.plan = await prepareImport(
    pendingImport.rows,
    pendingImport.filename,
    pendingImport.sheet,
    date,
  );
  showImportPreview();
}
function applyImport() {
  if (
    !pendingImport ||
    pendingImport.plan.issues.some((i) => i.blocking) ||
    !document.getElementById("importReviewed").checked
  )
    return;
  if (contentKey(snapshot()) !== pendingImport.base) {
    toast(
      "Workspace changed during preview. Upload the file again to review the latest data.",
    );
    return;
  }
  const { plan } = pendingImport;
  projects = plan.projects;
  for (const project of projects) {
    for (const [fn, name] of Object.entries(project.team)) {
      if (name && FUNCTIONS.includes(fn)) {
        PEOPLE[fn] ||= [];
        if (!PEOPLE[fn].includes(name)) PEOPLE[fn].push(name);
      }
    }
  }
  refreshUsers();
  if (current) current = projects.find((p) => p.id === current.id) || null;
  pendingImport = null;
  closeM("act");
  render();
  toast(
    `Imported: ${plan.created} new, ${plan.updated} updated. Check server save status.`,
  );
}
importExcel = async function (file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toast("The file exceeds the 10 MB limit.");
    return;
  }
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: true,
    });
    const sheet = workbook.SheetNames[0];
    if (!sheet) throw new Error("No worksheet found.");
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {
      header: 1,
      defval: "",
      raw: true,
    });
    if (rows.length < 2 || rows.length > 10001 || rows[0].length > 1000)
      throw new Error(
        "Use a header row and 1–10000 data rows, up to 1000 columns.",
      );
    pendingImport = {
      rows,
      filename: file.name,
      sheet,
      fallbackDate: "",
      base: contentKey(snapshot()),
    };
    pendingImport.plan = await prepareImport(rows, file.name, sheet);
    showImportPreview();
  } catch (error) {
    pendingImport = null;
    toast(`Import could not be prepared: ${error.message}`);
  }
};
const originalAdmin = rAdmin;
rAdmin = function () {
  const html = originalAdmin();
  let backup = null;
  try {
    backup = localStorage.getItem(BACKUP_KEY);
  } catch (_) {}
  return (
    html +
    (backup
      ? '<div class="card" style="margin-top:14px"><h2>Unsaved local backup</h2><p>A previous change was not confirmed by the server. Download it before deciding whether to restore it with Load workspace file.</p><button class="btn secondary" onclick="downloadUnsavedBackup()">Download unsaved backup</button></div>'
      : "")
  );
};
function downloadUnsavedBackup() {
  try {
    const stored = JSON.parse(localStorage.getItem(BACKUP_KEY));
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(stored.snapshot, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "Tooling_unsaved_workspace.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_) {
    toast("No local backup is available.");
  }
}
const originalProject = rProject;
rProject = function () {
  const html = originalProject();
  if (!current.importSource) return html;
  return (
    html +
    `<div class="card" style="margin-top:14px"><h2>Imported data review</h2><div class="hint">${escapeText(current.importSource.filename)} · row ${current.importSource.row}</div>
    ${(current.importWarnings || []).map((message) => `<div class="mail">${escapeText(message)}</div>`).join("")}
    <details><summary>Original spreadsheet values</summary><table>${current.importSource.headers.map((header, i) => `<tr><th>${escapeText(header)}</th><td style="white-space:pre-wrap">${escapeText(current.importSource.values[i])}</td></tr>`).join("")}</table></details></div>`
  );
};
const originalSummary = summary;
summary = function (project) {
  const result = originalSummary(project);
  if (result.open > 0) {
    result.pct = Math.min(99, result.pct);
    if (result.overall === "green") result.overall = "gray";
  }
  return result;
};
