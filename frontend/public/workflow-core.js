/* 可独立测试的日期、导入状态和编号规则。 */
globalThis.Workflow = (() => {
  const normalize = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const pending = (value) =>
    /^(?:pend(?:ing)?(?:\b.*)?|tbd|tbc|n\/?a|not applicable|unknown|not started|[-?]+)$/i.test(
      String(value ?? "").trim(),
    );
  function isoDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime()))
      return value.toISOString().slice(0, 10);
    let text = String(value ?? "").trim();
    const british = text.match(
      /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec) (\d{4})$/i,
    );
    if (british) {
      const month =
        [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ].indexOf(british[2].toLowerCase().slice(0, 3)) + 1;
      text = `${british[3]}-${String(month).padStart(2, "0")}-${british[1].padStart(2, "0")}`;
    }
    // 不把编号、自由文本和含多个日期的单元格交给宽松 Date 解析。
    let match = text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T00:00:00(?:\.000)?Z)?$/,
    );
    let y, m, d;
    if (match) [, y, m, d] = match;
    else {
      match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) return null;
      // 日/月均 <= 12 的斜杠日期有歧义，交由预览人工核对。
      if (+match[1] <= 12 && +match[2] <= 12 && match[1] !== match[2])
        return null;
      if (+match[1] > 12) [, d, m, y] = match;
      else [, m, d, y] = match;
    }
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    if (
      date.getUTCFullYear() !== +y ||
      date.getUTCMonth() !== +m - 1 ||
      date.getUTCDate() !== +d
    )
      return null;
    return date.toISOString().slice(0, 10);
  }
  function actionValue(raw, input, today, meta) {
    const text = raw instanceof Date ? isoDate(raw) : String(raw ?? "").trim();
    if (!text) return { value: "", done: null, warning: "" };
    return applyStatusRules(computeValue(raw, input, today), { meta, today });
  }
  function computeValue(raw, input, today) {
    const text = raw instanceof Date ? isoDate(raw) : String(raw ?? "").trim();
    if (!text) return { value: "", done: null, warning: "" };
    if (
      pending(text) &&
      !(
        input.includes(" / ") &&
        input
          .split(" / ")
          .some((choice) => normalize(choice) === normalize(text))
      )
    )
      return {
        value: "",
        done: null,
        warning: `Unresolved value retained: ${text}`,
      };
    if (/date/i.test(input)) {
      const date = isoDate(raw);
      if (date)
        return {
          value: date,
          done: null,
          warning: "Target date imported; actual completion is not confirmed.",
        };
      const completed = text.match(/^completed\s*[\r\n]+(.+)$/i);
      const actual = completed && isoDate(completed[1]);
      if (actual && actual <= today)
        return { value: actual, done: actual, warning: "" };
      return {
        value: "",
        done: null,
        warning: `Date or completion needs review: ${text}`,
      };
    }
    const choices = input.includes(" / ") ? input.split(" / ") : [];
    if (choices.length) {
      const choice = choices.find((c) => normalize(c) === normalize(text));
      if (!choice)
        return {
          value: "",
          done: null,
          warning: `Value is not a valid option: ${text}`,
        };
      return { value: choice, done: null, warning: "Value recorded; actual completion is not confirmed." };
    }
    if (/^completed(?:\s|\?|$)/i.test(text) && !/confirmation/i.test(input))
      return {
        value: "",
        done: null,
        warning: `Required result is missing: ${text}`,
      };
    return { value: text, done: null, warning: "Value recorded; actual completion is not confirmed." };
  }
  function nextId(projects, today) {
    const prefix = `TR-${today.slice(0, 4)}-`;
    const used = new Set(projects.map((p) => p.id));
    let n = 1;
    while (used.has(prefix + String(n).padStart(3, "0"))) n++;
    return prefix + String(n).padStart(3, "0");
  }
  /* v2 Phase-1 凭证状态：录入不再等于完成（评审反馈 B1/B2/B3/B7）。
     按 (ph, tab, act) 匹配矩阵动作；别名词表来自评审人措辞，存储值统一用标准枚举。 */
  const STATUS_VALUES = ["initiated", "in_progress", "approved"];
  const STANDARD_STATUS_LABELS = {
    initiated: "Initiated",
    in_progress: "In progress",
    approved: "Approved",
  };
  const STATUS_ALIAS_SETS = {
    CR: {
      initiated: "Created",
      in_progress: "Under Review",
      approved: "Approved",
    },
    BPW: {
      initiated: "Initiated",
      in_progress: "In Progress",
      approved: "Completed",
    },
  };
  const STATUS_RULES = [
    { ph: 1, tab: "CR", act: "Input CR number", alias: "CR" },
    {
      ph: 1,
      tab: "CVS CR",
      act: "Input CR number for CVS on Windchill",
      alias: "CR",
    },
    { ph: 2, tab: "Pre Grain", act: "Input pre-grain target date approval" },
    { ph: 2, tab: "Core BPW", act: "Input BPW number", alias: "BPW" },
    { ph: 3, tab: "AAR", act: "Input target date for approval" },
  ];
  const CLOSES_ON_RULES = [
    {
      ph: 2,
      tab: "PPAP Status",
      act: "Input if Draft, Interim approved, or Full approved",
      closes: ["Full approved"],
    },
  ];
  function statusRule(ph, tab, act) {
    return (
      STATUS_RULES.find((r) => r.ph === ph && r.tab === tab && r.act === act) ||
      null
    );
  }
  function closesRule(ph, tab, act) {
    return (
      CLOSES_ON_RULES.find(
        (r) => r.ph === ph && r.tab === tab && r.act === act,
      ) || null
    );
  }
  /* v2 Phase-2 日期历史（评审反馈 B4/B5/B8）：六处关键日期拆分原始/当前双日期。 */
  const DATE_HISTORY_RULES = [
    { ph: 1, tab: "FOT Date", act: "Input Supplier's target date for FOT" },
    {
      ph: 1,
      tab: "PPAP Sample Date",
      act: "Input Supplier's target date for Samples",
    },
    {
      ph: 1,
      tab: "PPAP Submission Date",
      act: "Input Supplier's target date for PPAP submission",
    },
    { ph: 2, tab: "Pre Grain", act: "Input pre-grain target date approval" },
    { ph: 3, tab: "AAR", act: "Input target date for approval" },
    { ph: 3, tab: "OEM BPW", act: "Input target date for approval" },
  ];
  function dateHistoryRule(ph, tab, act) {
    return (
      DATE_HISTORY_RULES.find(
        (r) => r.ph === ph && r.tab === tab && r.act === act,
      ) || null
    );
  }
  function statusAlias(rule, value) {
    if (!rule || !STATUS_VALUES.includes(value)) return String(value ?? "");
    const set = STATUS_ALIAS_SETS[rule.alias];
    return (set && set[value]) || STANDARD_STATUS_LABELS[value];
  }
  function actionCompletes(action) {
    // 仅判断是否具备完成条件，不能据此把普通录入自动标为完成。
    if (!validValue(action, action.value) || !String(action.value || "").trim()) return false;
    const rule = statusRule(action.ph, action.tab, action.act);
    if (rule) return action.status === "approved" && Boolean(action.value);
    const closes = closesRule(action.ph, action.tab, action.act);
    if (closes) return closes.closes.includes(action.value);
    return Boolean(action.value);
  }
  /* 2026-09-23 BPW 列拆分（用户拍板按推测关系映射）：一格可含多个审批编号，
     按段内文字标签分流——core 视为内部审批，ford/stla 等其他文字标签视为客户审批，
     无标签默认归 Core 并计数（导入时留痕提示业务核对）。段保留原文，标签信息不丢失。 */
  function splitBpwCell(cell) {
    const parts = String(cell ?? "")
      .split(/\r?\n|\//)
      .map((part) => part.trim())
      .filter(Boolean);
    const number = /bpw[\s-]*\d{2}\s*-\s*\d{3,}/i;
    const core = [],
      oem = [];
    let unlabeled = 0,
      hasNumber = false;
    for (const part of parts) {
      if (!number.test(part)) continue;
      hasNumber = true;
      const label = part.replace(number, "").trim();
      if (/\bcore\b/i.test(label)) core.push(part);
      else if (/[a-z]{3,}/i.test(label)) oem.push(part);
      else {
        core.push(part);
        unlabeled++;
      }
    }
    return { core, oem, unlabeled, hasNumber };
  }
  function applyStatusRules(result, args) {
    const meta = args && args.meta;
    if (!meta) return result;
    const rule = statusRule(meta.ph, meta.tab, meta.act);
    if (rule && result.value)
      return {
        ...result,
        done: null,
        warning:
          "Value recorded; the action stays open until the status is Approved.",
      };
    const closes = closesRule(meta.ph, meta.tab, meta.act);
    if (
      closes &&
      result.value &&
      !closes.closes.includes(result.value)
    )
      return {
        ...result,
        done: null,
        warning: `${result.value} recorded; the action completes only on ${closes.closes.join(" / ")}.`,
      };
    if (closes && closes.closes.includes(result.value))
      return { ...result, done: args.today, warning: "" };
    return result;
  }
  function validValue(action, value) {
    const text = String(value ?? "").trim();
    if (!text) return true;
    const choices = String(action.input || "").includes(" / ") ? action.input.split(" / ") : [];
    if (choices.length) return choices.includes(text);
    if (pending(text)) return false;
    return !/date/i.test(action.input || "") || Boolean(isoDate(text));
  }
  function recordDateChange(action, next, meta) {
    const text = String(next ?? "").trim();
    const date = text ? isoDate(text) : "";
    if (text && !date) throw new Error("Enter a valid date.");
    const previous = isoDate(action.value) || "";
    if (!action.orig && (previous || date)) action.orig = previous || date;
    action.value = date;
    if (previous === date) return false;
    (action.dateLog ||= []).push({ ts: meta.ts, by: meta.by, from: previous, to: date, source: meta.source });
    return true;
  }
  function validDateLog(log, current) {
    if (!Array.isArray(log)) return false;
    return log.every((entry, index) => entry &&
      Object.keys(entry).sort().join(",") === "by,from,source,to,ts" &&
      typeof entry.ts === "string" && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(entry.ts) &&
      isoDate(entry.ts.slice(0, 10)) === entry.ts.slice(0, 10) &&
      typeof entry.by === "string" && Boolean(entry.by.trim()) &&
      ["edit", "import"].includes(entry.source) &&
      [entry.from, entry.to].every(value => value === "" || (typeof value === "string" && isoDate(value) === value)) &&
      entry.from !== entry.to && (!index || (log[index - 1].to === entry.from && Date.parse(log[index - 1].ts) <= Date.parse(entry.ts)))) &&
      (current === undefined || !log.length || log.at(-1).to === (isoDate(current) || ""));
  }
  function dateMoved(action) {
    const current = isoDate(action.value);
    return Boolean(action.orig && current && action.orig !== current);
  }
  function retirePhases(project) {
    project.actions.forEach(moveCvsToDevelopment);
    const removed = project.actions.filter(a => a.ph >= 4);
    if (removed.length) project.retiredActions = [...(project.retiredActions || []), ...removed];
    project.actions = project.actions.filter(a => a.ph < 4);
    const known = new Set(project.actions.map(a => a.id));
    project.actions.forEach(a => {
      if (a.dep && !known.has(a.dep) && removed.some(r => r.id === a.dep)) {
        a.retiredDependency = a.dep;
        a.dep = null;
      }
    });
  }
  function activeMatrix(matrix) {
    matrix = matrix.map(row => moveCvsToDevelopment({...row}));
    const retained = matrix.map((row, index) => ({row, index})).filter(({row}) => row.ph < 4);
    const positions = new Map(retained.map(({index}, position) => [index, position]));
    return retained.map(({row}) => ({...row, dep: positions.get(row.dep) ?? null}));
  }
  function moveCvsToDevelopment(action) {
    if (action.ph === 2 && action.tab === "CVS CR" && !action.custom &&
        ["Input CR number for CVS on Windchill", "Identify if applicable or not"].includes(action.act)) action.ph = 1;
    return action;
  }
  function portfolioStatus(project, key) {
    const tab = {ppap: "PPAP Status", bpw: "Core BPW", preGrain: "Pre Grain", aar: "AAR"}[key];
    const actions = project.actions.filter(a => a.tab === tab);
    if (key === "ppap") return {Draft: "draft", "Interim approved": "interim", "Full approved": "approved"}[actions[0]?.value] || "not_created";
    if (actions.some(a => a.input === "Applicable / Not applicable" && a.value === "Not applicable")) return "not_applicable";
    const action = actions.find(a => statusRule(a.ph, a.tab, a.act));
    return action?.status === "approved" ? "approved" : ["initiated", "in_progress"].includes(action?.status) ? "in_progress" : "not_initiated";
  }
  return {
    validValue,
    recordDateChange,
    validDateLog,
    dateMoved,
    retirePhases,
    activeMatrix,
    portfolioStatus,
    normalize,
    pending,
    isoDate,
    actionValue,
    splitBpwCell,
    nextId,
    STATUS_VALUES,
    statusRule,
    closesRule,
    statusAlias,
    actionCompletes,
    dateHistoryRule,
  };
})();
