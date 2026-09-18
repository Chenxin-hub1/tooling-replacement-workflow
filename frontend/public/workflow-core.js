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
  function actionValue(raw, input, today) {
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
      return { value: choice, done: today, warning: "" };
    }
    if (/^completed(?:\s|\?|$)/i.test(text) && !/confirmation/i.test(input))
      return {
        value: "",
        done: null,
        warning: `Required result is missing: ${text}`,
      };
    return { value: text, done: today, warning: "" };
  }
  function nextId(projects, today) {
    const prefix = `TR-${today.slice(0, 4)}-`;
    const used = new Set(projects.map((p) => p.id));
    let n = 1;
    while (used.has(prefix + String(n).padStart(3, "0"))) n++;
    return prefix + String(n).padStart(3, "0");
  }
  return { normalize, pending, isoDate, actionValue, nextId };
})();
