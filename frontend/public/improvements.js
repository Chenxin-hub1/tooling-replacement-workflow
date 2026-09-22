/* 不重排桌面 UI；修正排期、校验、日期刷新和文件导入。 */
const escapeText = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
// 所有写值路径共用：真实改动使旧完成/审批失效，日期每次变化追加历史。
function updateActionValue(action, value, source = "edit") {
  const next = String(value ?? "").trim();
  if (!Workflow.validValue(action, next)) throw new Error("Enter a valid confirmed value.");
  const changed = Workflow.dateHistoryRule(action.ph, action.tab, action.act)
    ? Workflow.recordDateChange(action, next, { ts: new Date().toISOString(), by: me, source })
    : String(action.value || "") !== next;
  action.value = /date/i.test(action.input) && next ? Workflow.isoDate(next) : next;
  if (changed) {
    action.done = null;
    if (action.status === "approved") action.status = "in_progress";
  }
  return changed;
}
setValue = function (index, value) {
  const action = current.actions[index];
  try { updateActionValue(action, value); }
  catch (error) { toast(error.message); render(); return; }
  // Full approved 本身是明确批准；普通编号、日期、适用性仅保存信息。
  const closes = Workflow.closesRule(action.ph, action.tab, action.act);
  if (closes) action.done = closes.closes.includes(action.value) ? action.done || d2s(TODAY) : null;
  schedule(current);
  render();
  toast(action.done ? `${action.tab} completed — reminders stopped` : "Information saved — action remains open");
};
function saveActionInformation() { saveActionDialog(false); }
completeAction = function () { saveActionDialog(true); };
function saveActionDialog(confirmCompletion) {
  const { p, a } = actTarget;
  const entered = document.getElementById("aVal").value.trim();
  const rule = Workflow.statusRule(a.ph, a.tab, a.act);
  const closes = Workflow.closesRule(a.ph, a.tab, a.act);
  const nextStatus = document.getElementById("aStatus")?.value || "";
  if (closes) confirmCompletion = true;
  const completes = confirmCompletion && (rule ? nextStatus === "approved" : closes ? closes.closes.includes(entered) : true);
  // 全部校验通过才写入，避免失败的保存污染原始日期或历史。
  if (!Workflow.validValue(a, entered)) { toast("Enter a valid confirmed value."); return; }
  if (completes && !entered) { toast("Enter the required value before completion or approval."); return; }
  const done = document.getElementById("aDate").value;
  if (completes && (!Workflow.isoDate(done) || done > d2s(TODAY))) {
    toast("Enter a valid actual completion date, no later than today."); return;
  }
  updateActionValue(a, entered);
  a.link = document.getElementById("aLink").value;
  a.comment = document.getElementById("aCom").value;
  if (rule && confirmCompletion) { a.status = nextStatus; a.done = completes ? done : null; }
  else if (completes) a.done = done;
  schedule(p);
  closeM("act");
  render();
  toast(a.done ? "Action completed — reminders stopped" : "Information saved — action remains open");
}
// 凭证类动作的输入弹窗：值输入旁注入状态下拉（评审人措辞作为显示别名）；
// 双日期动作追加只读"Original date"面板，Admin 可修正并留痕（v2 Phase-2）。
const originalOpenAction = openAction;
openAction = function (id) {
  originalOpenAction(id);
  const { a } = actTarget;
  const rule = Workflow.statusRule(a.ph, a.tab, a.act);
  const closes = Workflow.closesRule(a.ph, a.tab, a.act);
  const dual = Workflow.dateHistoryRule(a.ph, a.tab, a.act);
  document.getElementById("aLink").value = a.link || "";
  document.getElementById("aCom").value = a.comment || "";
  // 弹窗兼作"更新状态/改期"入口：预填已保存的值，批准时无需重录。
  const valueInput = document.getElementById("aVal");
  if (valueInput && !valueInput.value) valueInput.value = a.value || "";

  document.getElementById("aDate").value = a.done || d2s(TODAY);
  const body = document.getElementById("actBody");
  body.querySelector(".mfoot .hint").textContent = "Saving information keeps the action open. Confirm completion separately.";
  if (!rule && !closes) {
    const save = document.createElement("button");
    save.className = "btn secondary";
    save.textContent = "Save information";
    save.onclick = saveActionInformation;
    body.querySelector(".mfoot .btn:not(.secondary)").before(save, document.createTextNode(" "));
  }
  const anchor = body.querySelector(".f2");
  if (dual) {
    const originalField = document.createElement("div");
    originalField.className = "field";
    const adminFix = isAdmin(me)
      ? `<div style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="date" id="aOrigAdj" value="${escapeText(a.orig || "")}" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px"> <button class="btn secondary sm" onclick="correctOriginal()">Correct original</button></div>`
      : "";
    originalField.innerHTML = `<label>Original date</label><div class="hint">${a.orig ? `set on first entry — current shows any move` : `set on first save`}${a.orig ? ` · <b>${escapeText(fmt(a.orig))}</b>` : ""}</div>${adminFix}`;
    if (a.origLog?.length) {
      const history = document.createElement("details");
      history.innerHTML = `<summary>Original date corrections (${a.origLog.length})</summary>${a.origLog.map(entry => `<div class="hint">${escapeText(entry.ts)} · ${escapeText(entry.by)} · ${escapeText(entry.from || "—")} → ${escapeText(entry.to)}</div>`).join("")}`;
      originalField.appendChild(history);
    }
    const changes = document.createElement("details");
    changes.dataset.dateHistory = "true";
    const entries = a.dateLog || [];
    changes.innerHTML = `<summary>Current date history (${entries.length})</summary>${entries.length ? entries.map(entry => `<div class="hint">${escapeText(entry.ts)} · ${escapeText(entry.by)} · ${escapeText(entry.from || "—")} → ${escapeText(entry.to || "—")} · ${escapeText(entry.source)}</div>`).join("") : '<div class="hint">No recorded changes yet.</div>'}`;
    originalField.appendChild(changes);
    anchor.parentNode.insertBefore(originalField, anchor);
  }
  if (!rule) {
    if (closes) {
      const button = body.querySelector(".mfoot .btn:not(.secondary)");
      const syncButton = () => {
        button.textContent = closes.closes.includes(valueInput.value) ? "Mark complete" : "Save status";
      };
      valueInput.addEventListener("change", syncButton);
      syncButton();
      body.querySelector(".mfoot .hint").textContent = `The action completes only on ${closes.closes.join(" / ")}.`;
    }
    document.getElementById("aVal").focus();
    return;
  }
  const options = Workflow.STATUS_VALUES.map(
    (value) =>
      `<option value="${value}" ${a.status === value ? "selected" : ""}>${escapeText(Workflow.statusAlias(rule, value))}</option>`,
  ).join("");
  const field = document.createElement("div");
  field.className = "field";
  field.innerHTML = `<label>Status</label><select id="aStatus"><option value="">— not initiated</option>${options}</select>`;
  anchor.parentNode.insertBefore(field, anchor);
  const button = body.querySelector(".mfoot .btn:not(.secondary)");
  const syncButton = () => {
    if (button)
      button.textContent =
        document.getElementById("aStatus").value === "approved"
          ? "Mark complete"
          : "Save status";
  };
  field.querySelector("select").addEventListener("change", syncButton);
  syncButton();
  document.getElementById("aVal").focus();
};
// Admin 修正原始日期（处理手误）：校验日期、写 origLog 留痕后生效。
function correctOriginal() {
  const { p, a } = actTarget;
  if (!Workflow.dateHistoryRule(a.ph, a.tab, a.act) || !isAdmin(me)) {
    toast("Only an admin can correct the original date.");
    return;
  }
  const next = document.getElementById("aOrigAdj").value;
  if (!Workflow.isoDate(next)) {
    toast("Enter a valid date for the original.");
    return;
  }
  if (next === (a.orig || "")) return;
  (a.origLog = a.origLog || []).push({
    ts: new Date().toISOString(),
    by: me,
    from: a.orig || "",
    to: next,
  });
  a.orig = next;
  schedule(p);
  closeM("act");
  render();
  toast(`Original date corrected to ${fmt(next)} — change logged`);
}
// 项目动作表：凭证类动作的值输入旁加状态下拉（状态即完成开关）；
// 双日期动作在值变化后追加"moved from 原始日期"标记（评审人要求人人可见）。
const originalInputField = inputField;
inputField = function (index, action) {
  const base = originalInputField(index, action);
  const rule = Workflow.statusRule(action.ph, action.tab, action.act);
  const dual = Workflow.dateHistoryRule(action.ph, action.tab, action.act);
  if (!rule && !dual) return base;
  const statusSelect = rule
    ? `<select onchange="setStatus(${index},this.value)" title="Approval status" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:12px"><option value="">—</option>${Workflow.STATUS_VALUES.map(
        (value) =>
          `<option value="${value}" ${action.status === value ? "selected" : ""}>${escapeText(Workflow.statusAlias(rule, value))}</option>`,
      ).join("")}</select>`
    : "";
  const movedTag =
    dual && Workflow.dateMoved(action)
      ? `<span class="hint" title="Date moved from the original">moved from ${escapeText(fmt(action.orig))}</span>`
      : "";
  const historyButton = dual ? `<button class="btn secondary sm" onclick="openAction('${escJs(action.id)}')">Dates</button>` : "";
  return `<span style="display:inline-flex;gap:4px;align-items:center;flex-wrap:wrap">${base}${statusSelect}${movedTag}${historyButton}</span>`;
};
function setStatus(index, value) {
  const action = current.actions[index];
  if (value && !Workflow.STATUS_VALUES.includes(value)) return;
  if (value === "approved" && (!String(action.value || "").trim() || !Workflow.validValue(action, action.value))) {
    toast("Enter the required valid value before approval."); render(); return;
  }
  action.status = value;
  action.done = value === "approved" ? action.done || d2s(TODAY) : null;
  schedule(current);
  render();
  if (action.done) toast(`${action.tab} completed — reminders stopped`);
}
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
  for (const span of spans) span.style.cssText = "";
  timeline.style.height = "";
  const inner = timeline.getBoundingClientRect();

  // 第一步：先把贴边标签内收到位。若先分层后内收，内收产生的水平位移
  // 不会参与碰撞判定，同层标签会在内收后叠字（右侧 100% 标签最易触发）。
  for (const span of spans) {
    const rect = span.getBoundingClientRect();
    if (rect.left < inner.left - 1) {
      span.style.left = "7px";
      span.style.transform = "none";
    } else if (rect.right > inner.right + 1) {
      span.style.left = "auto";
      span.style.right = "7px";
      span.style.transform = "none";
    }
  }

  // 第二步：在最终水平坐标上重新测量并分层，冲突的逐层下移。
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
      const dual = Workflow.dateHistoryRule(action.ph, action.tab, action.act);
      const rule = Workflow.statusRule(action.ph, action.tab, action.act);
      const column = colName(action, project.actions);
      const hasColumn = suffix => headers.some(h => Workflow.normalize(h) === Workflow.normalize(`${column} — ${suffix}`));
      const extra = suffix => sourceText(get([Workflow.normalize(`${column} — ${suffix}`)]));
      const hasValue = (dual && hasColumn("Current date")) || headers.some(h => [exact, ...(actionAliases[action.tab] || [])].includes(Workflow.normalize(h)));
      const raw = dual && hasColumn("Current date") ? extra("Current date") : get([exact, ...(actionAliases[action.tab] || [])]);
      const importedStatus = extra("Approval status");
      if (rule && hasColumn("Approval status") && importedStatus && !Workflow.STATUS_VALUES.includes(importedStatus))
        issue(`${action.tab}: Invalid approval status.`, true);
      const originalDate = extra("Original date");
      if (dual && originalDate) {
        const parsed = Workflow.isoDate(originalDate);
        if (!parsed) issue(`${action.tab}: Invalid original date.`, true);
        else if (action.orig && action.orig !== parsed)
          issue(`${action.tab}: Original date differs; use the Admin correction with audit history.`, true);
        else action.orig = parsed;
      }
      const explicitEmpty = hasValue && !sourceText(raw) && (hasColumn("Completed date") || (dual && hasColumn("Current date")));
      if (!hasValue && !hasColumn("Approval status") && !hasColumn("Completed date")) continue;
      const previousValue = action.value, previousDone = action.done, previousStatus = action.status;
      const result = Workflow.actionValue(raw, action.input, d2s(TODAY), action);
      if (result.warning) issue(`${action.tab}: ${result.warning}`);
      let importedHistory = null;
      if (dual && hasColumn("Date history") && extra("Date history")) {
        try {
          importedHistory = JSON.parse(extra("Date history"));
          if (!Workflow.validDateLog(importedHistory, original ? undefined : result.value)) throw new Error("Invalid history");
        } catch {
          issue(`${action.tab}: Invalid date history.`, true);
          continue;
        }
      }
      // 新项目恢复原历史；已有项目只追加导入引起的实际变化，不覆盖本地记录。
      if (result.value || explicitEmpty) {
        updateActionValue(action, result.value, "import");
        if (!original && importedHistory?.length) action.dateLog = importedHistory;
      }
      // 即使同值重导，也只用本次文件明确提供的完成证据，不继承旧完成标记。
      action.done = null;
      if (rule) {
        if (hasColumn("Approval status")) action.status = importedStatus;
        else if (action.status === "approved") action.status = "in_progress";
      }
      const validImportedValue = hasValue ? Boolean(result.value) : Boolean(action.value) && Workflow.validValue(action, action.value);
      const closes = Workflow.closesRule(action.ph, action.tab, action.act);
      const approved = rule ? importedStatus === "approved" : Boolean(closes && hasValue && closes.closes.includes(result.value));
      const completed = extra("Completed date");
      const parsed = Workflow.isoDate(completed);
      if (completed && (!parsed || parsed > d2s(TODAY)))
        issue(`${action.tab}: Invalid actual completion date.`, true);
      else if (approved && !validImportedValue) {
        issue(`${action.tab}: Approval requires a valid value in this import.`, true);
      } else if (validImportedValue && Workflow.actionCompletes(action)) {
        if (approved) {
          const unchangedApproval = previousValue === action.value && (!rule || previousStatus === "approved");
          const keptDate = unchangedApproval && Workflow.isoDate(previousDone) && previousDone <= d2s(TODAY) ? previousDone : null;
          action.done = parsed || keptDate || d2s(TODAY);
        } else if (!rule && !closes) action.done = parsed || result.done || null;
      }
      if (previousDone && !action.done)
        issue(`${action.tab}: Reopened — this import does not provide the completion or approval required by the current rules.`);
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
    const range = XLSX.utils.decode_range(workbook.Sheets[sheet]["!ref"] || "A1");
    if (range.e.r >= 10001 || range.e.c >= 1000)
      throw new Error("Use up to 10000 data rows and 1000 columns.");
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
let adminBackups = [];
rAdmin = function () {
  const html = originalAdmin();
  // 当前标签页的实时备份和其他标签页遗留的孤儿备份都在这里集中展示；
  // 孤儿备份由 workspace.js 在页面加载时按保留策略（14 天 / 份数上限）淘汰。
  adminBackups = listLocalBackups();
  if (!adminBackups.length) return html;
  const rows = adminBackups
    .map(
      (backup, index) =>
        `<tr><th>${backup.live ? "This tab" : "Another tab"}</th><td>${escapeText(
          backup.when
            ? new Date(backup.when).toLocaleString("en-GB")
            : "date unknown",
        )} · revision ${backup.revision}</td><td><button class="btn secondary" onclick="downloadLocalBackup(${index})">Download unsaved backup</button>${
          backup.live
            ? ""
            : ` <button class="btn secondary" onclick="discardLocalBackup(${index})">Delete</button>`
        }</td></tr>`,
    )
    .join("");
  return `${html}<div class="card" style="margin-top:14px"><h2>Unsaved local backups</h2><p>Changes the server never confirmed. Download a backup before restoring it with Load workspace file; backups left by other tabs are removed after two weeks.</p><table>${rows}</table></div>`;
};
function downloadLocalBackup(index) {
  try {
    const stored = JSON.parse(localStorage.getItem(adminBackups[index].key));
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
function discardLocalBackup(index) {
  const backup = adminBackups[index];
  if (
    !backup ||
    !confirm("Delete this unsaved backup? Its changes cannot be recovered.")
  )
    return;
  try {
    localStorage.removeItem(backup.key);
  } catch (_) {}
  render();
}
// 样板的载入函数没有完成回调：一次性挂钩 restore，在文件成功载入后立刻
// 取回最新版本号解锁保存冲突并提交，不必刷新页面或等下一次交互。
loadWorkspaceFile = async function (file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast("Workspace exceeds 10 MB."); return; }
  try {
    const data = JSON.parse(await file.text());
    const response = await fetch("/api/workspace/validate", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Invalid workspace file; current workspace was kept.");
    const checked = await response.json();
    restore(checked);
    current = null;
    view = "admin";
    refreshUsers();
    render();
    await recoverAndSave();
    toast(STORAGE_OK ? `Workspace loaded · ${projects.length} projects` : "Workspace loaded locally; server save failed. Download a backup before reloading.");
  } catch (error) {
    toast(error.message || "Could not read that workspace file.");
  }
};
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

// 启动时保留旧 done/status，不从已完成推断批准，不虚构过去的日期历史。
// Phase-2：全部项目的双日期动作缺 orig 时补"当前值即原始值"（提案既有数据升级规则）。
function normalizeV2Fields() {
  projects.forEach((project) => {
    Workflow.retirePhases(project);
    project.actions.forEach((action) => {
      const dual = Workflow.dateHistoryRule(action.ph, action.tab, action.act);
      // orig 只存 ISO 日期：演示数据的 "16 May 2026" 显示格式须经 isoDate 规范，
      // 否则 workspace 校验拒收、保存链路被卡死。
      if (dual && action.value) {
        const iso = Workflow.isoDate(action.value);
        if (iso) {
          if (!action.orig) action.orig = iso;
          action.value = iso;
        }
      }
    });
  });
}
const originalRestoreForStatus = restore;
restore = function (data) {
  const upgraded = structuredClone(data);
  upgraded.projects.forEach(Workflow.retirePhases);
  upgraded.MATRIX = Workflow.activeMatrix(upgraded.MATRIX);
  originalRestoreForStatus(upgraded);
  normalizeV2Fields();
};
normalizeV2Fields();

// 新建演示数据与读取服务器走同一升级规则，首次访问也保存完整原始日期。
const originalSeedV2 = seed;
seed = function () {
  originalSeedV2();
  projects.forEach(project => project.actions.forEach(action => {
    if (!action.done) return;
    if (Workflow.statusRule(action.ph, action.tab, action.act)) action.status = "approved";
    const closes = Workflow.closesRule(action.ph, action.tab, action.act);
    if (closes) action.value = closes.closes[0];
  }));
  normalizeV2Fields();
};

const originalFiltersV2 = filterBar;
filterBar = function (showActionFilters) {
  const html = originalFiltersV2(showActionFilters);
  if (view !== "portfolio") return html;
  const fields = [
    ["ppap", "PPAP Status", [["not_created", "Not created"], ["draft", "Draft"], ["interim", "Interim approved"], ["approved", "Full approved"]]],
    ["bpw", "BPW", [["not_initiated", "Not initiated"], ["in_progress", "In progress"], ["approved", "Completed"]]],
    ...[ ["preGrain", "Pre Grain"], ["aar", "AAR"] ].map(([key, label]) => [key, label, [["not_applicable", "Not applicable"], ["not_initiated", "Not initiated"], ["in_progress", "In progress"], ["approved", "Approved"]]]),
  ];
  const extra = fields.map(([key, label, options]) => `<select aria-label="${label}" onchange="F.${key}=this.value;render()"><option value="">${label}</option>${options.map(([value, text]) => `<option value="${value}" ${F[key] === value ? "selected" : ""}>${text}</option>`).join("")}</select>`).join("");
  return html.replace('<button class="clear"', extra + '<button class="clear"');
};
const originalFilteredProjectsV2 = filteredProjects;
filteredProjects = function () {
  return originalFilteredProjectsV2().filter(project => view !== "portfolio" ||
    ["ppap", "bpw", "preGrain", "aar"].every(key => !F[key] || Workflow.portfolioStatus(project, key) === F[key]));
};

// 保持首表可回导；动作明细同时提供审批状态、原始/当前日期和修正记录。
const originalFlatRowV2 = flatRow;
flatRow = function (project) {
  const row = originalFlatRowV2(project);
  for (const action of project.actions) {
    const name = colName(action, project.actions);
    if (Workflow.statusRule(action.ph, action.tab, action.act)) row[`${name} — Approval status`] = action.status || "";
    if (Workflow.dateHistoryRule(action.ph, action.tab, action.act)) {
      row[`${name} — Original date`] = action.orig || "";
      row[`${name} — Current date`] = action.value || "";
      row[`${name} — Date history`] = JSON.stringify(action.dateLog || []);
    }
    row[`${name} — Completed date`] = action.done || "";
  }
  return row;
};
const originalActionRowV2 = actionRow;
actionRow = function (project, action) {
  return {...originalActionRowV2(project, action),
    "Approval status": action.status || "",
    "Original date": action.orig || "",
    "Current date": Workflow.dateHistoryRule(action.ph, action.tab, action.act) ? action.value || "" : "",
    "Original date corrections": JSON.stringify(action.origLog || []),
    "Current date history": JSON.stringify(action.dateLog || []),
  };
};
