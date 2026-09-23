import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
const context: Record<string, any> = { Date };
runInNewContext(
  readFileSync(new URL("../public/workflow-core.js", import.meta.url), "utf8"),
  context,
);
const core = context.Workflow;
describe("spreadsheet interpretation", () => {
  it.each(["PEND", "Pending CVS release", "TBD", "NA", "?", "-"])(
    "does not complete %s",
    (raw) => {
      expect(core.actionValue(raw, "CR number", "2026-09-15").done).toBeNull();
    },
  );
  it("does not mistake a target date for actual completion", () => {
    expect(core.actionValue("2026-10-20", "Date", "2026-09-15")).toMatchObject({
      value: "2026-10-20",
      done: null,
    });
    expect(
      core.actionValue("Completed\n5/20/2026", "Date", "2026-09-15"),
    ).toMatchObject({ value: "2026-05-20", done: "2026-05-20" });
  });
  it.each([
    "02/03/2026",
    "2026-02-30",
    "12/01/2026\n8/26/2026",
    "Completed ?",
    "12345",
  ])("retains ambiguous date %s for review", (raw) => {
    expect(core.actionValue(raw, "Date", "2026-09-15").done).toBeNull();
    expect(core.actionValue(raw, "Date", "2026-09-15").warning).toBeTruthy();
  });
  it("normalizes options without inventing approvals", () => {
    expect(
      core.actionValue(
        "Full Approved",
        "Draft / Interim approved / Full approved",
        "2026-09-15",
      ).value,
    ).toBe("Full approved");
    expect(
      core.actionValue("Maybe", "External / Internal", "2026-09-15").done,
    ).toBeNull();
  });
  it("does not duplicate IDs after a deletion", () => {
    expect(
      core.nextId([{ id: "TR-2026-001" }, { id: "TR-2026-003" }], "2026-09-15"),
    ).toBe("TR-2026-002");
  });
});

it("records an applicability choice without treating it as completion", () => {
  expect(
    core.actionValue(
      "Not applicable",
      "Applicable / Not applicable",
      "2026-09-15",
    ).done,
  ).toBeNull();
  expect(
    core.actionValue("NA", "Applicable / Not applicable", "2026-09-15").done,
  ).toBeNull();
});
it("does not infer actual completion from a future completion date or missing reference", () => {
  expect(
    core.actionValue("Completed\n2027-01-15", "Date", "2026-09-15").done,
  ).toBeNull();
  expect(
    core.actionValue("Completed", "CR number", "2026-09-15").done,
  ).toBeNull();
});

describe("v2 status semantics (B1/B2/B3/B7)", () => {
  const CR = { ph: 1, tab: "CR", act: "Input CR number" };
  const CVS = {
    ph: 1,
    tab: "CVS CR",
    act: "Input CR number for CVS on Windchill",
  };
  const PRE_GRAIN = {
    ph: 2,
    tab: "Pre Grain",
    act: "Input pre-grain target date approval",
  };
  const CORE_BPW = { ph: 2, tab: "Core BPW", act: "Input BPW number" };
  const AAR = { ph: 3, tab: "AAR", act: "Input target date for approval" };
  const PPAP = {
    ph: 2,
    tab: "PPAP Status",
    act: "Input if Draft, Interim approved, or Full approved",
  };

  it("matches exactly the five status-tracked actions", () => {
    for (const meta of [CR, CVS, PRE_GRAIN, CORE_BPW, AAR])
      expect(core.statusRule(meta.ph, meta.tab, meta.act)).toBeTruthy();
    expect(core.statusRule(1, "CR", "Input CR number")).toBeTruthy();
    // OEM BPW 与 Core BPW 的目标日期动作不带状态。
    expect(core.statusRule(3, "OEM BPW", "Identify BPW number")).toBeNull();
    expect(
      core.statusRule(2, "Core BPW", "Input target date for approval"),
    ).toBeNull();
    // 同名动作在不同阶段不误匹配。
    expect(core.statusRule(2, "CR", "Input CR number")).toBeNull();
  });

  it("uses the reviewer wording as display aliases", () => {
    const rule = core.statusRule(CR.ph, CR.tab, CR.act);
    expect(core.statusAlias(rule, "initiated")).toBe("Created");
    expect(core.statusAlias(rule, "in_progress")).toBe("Under Review");
    expect(core.statusAlias(rule, "approved")).toBe("Approved");
    const bpw = core.statusRule(CORE_BPW.ph, CORE_BPW.tab, CORE_BPW.act);
    expect(core.statusAlias(bpw, "approved")).toBe("Completed");
    const grain = core.statusRule(PRE_GRAIN.ph, PRE_GRAIN.tab, PRE_GRAIN.act);
    expect(core.statusAlias(grain, "in_progress")).toBe("In progress");
  });

  it("completes status-tracked actions only on approved status plus value", () => {
    expect(core.actionCompletes({ ...CR, value: "CR-123" })).toBe(false);
    expect(
      core.actionCompletes({ ...CR, value: "CR-123", status: "created" }),
    ).toBe(false);
    expect(core.actionCompletes({ ...CR, status: "approved" })).toBe(false);
    expect(
      core.actionCompletes({ ...CR, value: "CR-123", status: "approved" }),
    ).toBe(true);
  });

  it("completes PPAP status only on Full approved", () => {
    expect(core.actionCompletes({ ...PPAP, value: "Draft" })).toBe(false);
    expect(core.actionCompletes({ ...PPAP, value: "Interim approved" })).toBe(
      false,
    );
    expect(core.actionCompletes({ ...PPAP, value: "Full approved" })).toBe(
      true,
    );
  });

  it("allows a populated ordinary action to be explicitly completed", () => {
    expect(
      core.actionCompletes({
        ph: 1,
        tab: "FOT Date",
        act: "Input Supplier's target date for FOT",
        value: "2026-04-01",
      }),
    ).toBe(true);
  });

  it("imported numbers remain open until completion is explicitly confirmed", () => {
    expect(
      core.actionValue("CR-25-001", "CR number", "2026-09-15"),
    ).toMatchObject({ value: "CR-25-001", done: null });
    expect(
      core.actionValue("CR-25-001", "CR number", "2026-09-15", CR),
    ).toMatchObject({ value: "CR-25-001", done: null });
    expect(
      core.actionValue("CR-25-001", "CR number", "2026-09-15", CR).warning,
    ).toBeTruthy();
  });

  it("import keeps a non-closing PPAP choice open", () => {
    const input = "Draft / Interim approved / Full approved";
    expect(core.actionValue("Draft", input, "2026-09-15", PPAP)).toMatchObject({
      value: "Draft",
      done: null,
    });
    expect(
      core.actionValue("Full approved", input, "2026-09-15", PPAP),
    ).toMatchObject({ value: "Full approved", done: "2026-09-15" });
  });

  it.each([
    ["PPAP-123", "PPAP ID"],
    ["BPO-123", "BPO number"],
    ["Internal", "External / Internal"],
    ["2026-04-01", "Date"],
  ])("does not import %s as a completed action", (value, input) => {
    expect(core.actionValue(value, input, "2026-09-15")).toMatchObject({
      value,
      done: null,
    });
  });

  it.each([
    [CR, "CR-LEGACY", "CR number"],
    [CVS, "CVS-LEGACY", "CR number"],
    [CORE_BPW, "BPW-LEGACY", "BPW number"],
    [PRE_GRAIN, "2026-04-01", "Date"],
    [AAR, "2026-04-01", "Date"],
  ])(
    "does not treat an action's old approval as evidence in a new import",
    (meta, value, input) => {
      expect(
        core.actionValue(value, input, "2026-09-15", {
          ...(meta as object),
          value,
          done: "2026-04-01",
          status: "approved",
        }),
      ).toMatchObject({ value, done: null });
    },
  );

  it.each(["Draft", "Interim approved", "Full approved"])(
    "re-evaluates imported PPAP %s regardless of legacy completion",
    (value) => {
      expect(
        core.actionValue(
          value,
          "Draft / Interim approved / Full approved",
          "2026-09-15",
          {
            ...PPAP,
            value: "Full approved",
            done: "2026-04-01",
          },
        ),
      ).toMatchObject({
        value,
        done: value === "Full approved" ? "2026-09-15" : null,
      });
    },
  );
});

describe("v2 date history (B4/B5/B8)", () => {
  const FOT = {
    ph: 1,
    tab: "FOT Date",
    act: "Input Supplier's target date for FOT",
  };
  const SAMPLE = {
    ph: 1,
    tab: "PPAP Sample Date",
    act: "Input Supplier's target date for Samples",
  };
  const SUBMISSION = {
    ph: 1,
    tab: "PPAP Submission Date",
    act: "Input Supplier's target date for PPAP submission",
  };
  const PRE_GRAIN = {
    ph: 2,
    tab: "Pre Grain",
    act: "Input pre-grain target date approval",
  };
  const AAR = { ph: 3, tab: "AAR", act: "Input target date for approval" };
  const OEM_BPW = {
    ph: 3,
    tab: "OEM BPW",
    act: "Input target date for approval",
  };

  it("matches exactly the six dual-date actions", () => {
    for (const meta of [FOT, SAMPLE, SUBMISSION, PRE_GRAIN, AAR, OEM_BPW])
      expect(core.dateHistoryRule(meta.ph, meta.tab, meta.act)).toBeTruthy();
    // 相邻日期动作不误命中：Core BPW 目标日期、SOP、Current Coverage。
    expect(
      core.dateHistoryRule(2, "Core BPW", "Input target date for approval"),
    ).toBeNull();
    expect(
      core.dateHistoryRule(1, "SOP", "Input date needed by ZF to implement"),
    ).toBeNull();
    expect(
      core.dateHistoryRule(
        1,
        "Current Coverage",
        "Input date of coverage on current supplier",
      ),
    ).toBeNull();
  });

  it("keeps dual-date and status rules aligned on shared actions", () => {
    // Pre Grain / AAR 同时是凭证类与双日期动作；FOT/OEM BPW 仅双日期。
    expect(
      core.statusRule(PRE_GRAIN.ph, PRE_GRAIN.tab, PRE_GRAIN.act),
    ).toBeTruthy();
    expect(core.statusRule(AAR.ph, AAR.tab, AAR.act)).toBeTruthy();
    expect(core.statusRule(FOT.ph, FOT.tab, FOT.act)).toBeNull();
    expect(core.statusRule(OEM_BPW.ph, OEM_BPW.tab, OEM_BPW.act)).toBeNull();
  });

  it.each([FOT, SAMPLE, SUBMISSION, PRE_GRAIN, AAR, OEM_BPW])(
    "requires new completion evidence when importing an unchanged $tab target date",
    (meta) => {
      expect(
        core.actionValue("2026-04-01", "Date", "2026-09-15", {
          ...meta,
          value: "2026-04-01",
          orig: "2026-04-01",
          done: "2026-04-01",
          status: "approved",
        }),
      ).toMatchObject({ value: "2026-04-01", done: null });
    },
  );

  it.each([FOT, SAMPLE, SUBMISSION, PRE_GRAIN, AAR, OEM_BPW])(
    "retains every accepted current-date change for $tab",
    (meta) => {
      const action: Record<string, any> = { ...meta, value: "" };
      const edits = ["2026-04-01", "2026-11-01", "", "2026-11-03"];
      for (const [index, value] of edits.entries()) {
        expect(
          core.recordDateChange(action, value, {
            ts: `2026-09-15T08:00:0${index}.000Z`,
            by: "Carrie Chen",
            source: "edit",
          }),
        ).toBe(true);
      }
      expect(action).toMatchObject({
        orig: "2026-04-01",
        value: "2026-11-03",
        dateLog: edits.map((to, index) => ({
          ts: `2026-09-15T08:00:0${index}.000Z`,
          by: "Carrie Chen",
          from: index ? edits[index - 1] : "",
          to,
          source: "edit",
        })),
      });
      const before = structuredClone(action);
      expect(
        core.recordDateChange(action, "3 Nov 2026", {
          ts: "2026-09-15T09:00:00.000Z",
          by: "Another editor",
          source: "edit",
        }),
      ).toBe(false);
      expect(action).toEqual(before);
    },
  );

  it("preserves an existing original date and its separate correction log on import", () => {
    const action: Record<string, any> = {
      ...FOT,
      value: "2026-06-01",
      orig: "2026-04-01",
      origLog: [
        {
          ts: "2026-03-01T08:00:00.000Z",
          by: "Admin",
          from: "2026-03-01",
          to: "2026-04-01",
        },
      ],
    };
    const corrections = structuredClone(action.origLog);
    core.recordDateChange(action, "2026-11-01", {
      ts: "2026-09-15T08:00:00.000Z",
      by: "Carrie Chen",
      source: "import",
    });
    expect(action.orig).toBe("2026-04-01");
    expect(action.origLog).toEqual(corrections);
    expect(action.dateLog).toEqual([
      {
        ts: "2026-09-15T08:00:00.000Z",
        by: "Carrie Chen",
        from: "2026-06-01",
        to: "2026-11-01",
        source: "import",
      },
    ]);
  });

  it("uses the existing current date as original for legacy actions before clearing", () => {
    const action: Record<string, any> = { ...FOT, value: "16 May 2026" };
    core.recordDateChange(action, "", {
      ts: "2026-09-15T08:00:00.000Z",
      by: "Carrie Chen",
      source: "edit",
    });
    expect(action).toMatchObject({
      orig: "2026-05-16",
      value: "",
      dateLog: [{ from: "2026-05-16", to: "" }],
    });
  });

  it("rejects an invalid date without altering its value or history", () => {
    const action = {
      ...FOT,
      value: "2026-04-01",
      orig: "2026-04-01",
      dateLog: [],
    };
    const before = structuredClone(action);
    expect(() =>
      core.recordDateChange(action, "2026-02-30", {
        ts: "2026-09-15T08:00:00.000Z",
        by: "Carrie Chen",
        source: "edit",
      }),
    ).toThrow();
    expect(action).toEqual(before);
  });
});

describe("v2 migration and portfolio filters", () => {
  it("compares normalized dates and does not call an empty value a move", () => {
    expect(core.dateMoved({ orig: "2026-05-16", value: "16 May 2026" })).toBe(
      false,
    );
    expect(core.dateMoved({ orig: "2026-05-16", value: "" })).toBe(false);
    expect(core.dateMoved({ orig: "2026-05-16", value: "2026-05-17" })).toBe(
      true,
    );
  });
  it("retires old phases without losing records and remaps custom template dependencies", () => {
    const project = {
      actions: [
        { id: "old", ph: 4 },
        { id: "custom", ph: 2, dep: "old" },
      ],
    };
    core.retirePhases(project);
    core.retirePhases(project);
    expect(project).toMatchObject({
      actions: [{ id: "custom", dep: null, retiredDependency: "old" }],
      retiredActions: [{ id: "old" }],
    });
    expect(
      core.activeMatrix([
        { ph: 1, dep: null },
        { ph: 5, dep: null },
        { ph: 2, dep: 0 },
        { ph: 3, dep: 2 },
      ]),
    ).toEqual([
      { ph: 1, dep: null },
      { ph: 2, dep: 0 },
      { ph: 3, dep: 1 },
    ]);
  });
  it("filters real approval states, applicability and missing values", () => {
    const action = {
      ph: 3,
      tab: "AAR",
      act: "Input target date for approval",
      value: "2026-05-17",
      status: "in_progress",
    };
    expect(core.portfolioStatus({ actions: [action] }, "aar")).toBe(
      "in_progress",
    );
    expect(
      core.portfolioStatus(
        { actions: [{ ...action, status: "approved" }] },
        "aar",
      ),
    ).toBe("approved");
    expect(
      core.portfolioStatus(
        {
          actions: [
            action,
            {
              tab: "AAR",
              input: "Applicable / Not applicable",
              value: "Not applicable",
            },
          ],
        },
        "aar",
      ),
    ).toBe("not_applicable");
    expect(core.portfolioStatus({ actions: [] }, "ppap")).toBe("not_created");
    expect(
      core.portfolioStatus(
        { actions: [{ tab: "PPAP Status", value: "Interim approved" }] },
        "ppap",
      ),
    ).toBe("interim");
  });
});

describe("v2 Phase-5 BPW cell split (2026-09-23 user decision)", () => {
  it("splits a labeled multi-number cell into Core and OEM parts verbatim", () => {
    const cell =
      "BPW-26-34300066 Ford\r\nBPW-25-34300392  STLA\r\nBPW-26-34300153 Core";
    expect(core.splitBpwCell(cell)).toMatchObject({
      core: ["BPW-26-34300153 Core"],
      oem: ["BPW-26-34300066 Ford", "BPW-25-34300392  STLA"],
      unlabeled: 0,
      hasNumber: true,
    });
  });

  it("routes unlabeled numbers to Core and counts them for the import warning", () => {
    expect(core.splitBpwCell("BPW-25-4110130")).toMatchObject({
      core: ["BPW-25-4110130"],
      oem: [],
      unlabeled: 1,
      hasNumber: true,
    });
    expect(core.splitBpwCell("BPW 23-34300301").unlabeled).toBe(1);
  });

  it("keeps placeholder-only cells without numbers unresolved", () => {
    expect(core.splitBpwCell("Pending")).toMatchObject({
      core: [],
      oem: [],
      unlabeled: 0,
      hasNumber: false,
    });
    expect(core.splitBpwCell("TBD\r\nPending").hasNumber).toBe(false);
  });

  it("tolerates slash-separated parts and ignores stray text without numbers", () => {
    expect(
      core.splitBpwCell("BPW-26-4110019 / BPW-26-4110020 Core"),
    ).toMatchObject({
      oem: [],
      core: ["BPW-26-4110019", "BPW-26-4110020 Core"],
      unlabeled: 1,
    });
    expect(core.splitBpwCell("see comment above")).toMatchObject({
      hasNumber: false,
    });
  });

  it("leaves import warnings truthful: a recorded number still does not complete", () => {
    const BPW = {
      ph: 2,
      tab: "Core BPW",
      act: "Input BPW number",
      input: "BPW number",
    };
    const result = core.actionValue(
      "BPW-26-34300153",
      "BPW number",
      "2026-09-23",
      BPW,
    );
    expect(result).toMatchObject({ value: "BPW-26-34300153", done: null });
    expect(result.warning).toBeTruthy();
  });
});
