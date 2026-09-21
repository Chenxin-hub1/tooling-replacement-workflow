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

it("allows an explicit Not applicable choice but not an unknown NA marker", () => {
  expect(
    core.actionValue(
      "Not applicable",
      "Applicable / Not applicable",
      "2026-09-15",
    ).done,
  ).toBe("2026-09-15");
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
