import { describe, it, expect } from "vitest";
import { filterProjects, safeLink, actionInput } from "./domain";
import type {
  ActionResponse,
  ProjectListItem,
} from "../api/generated/types.gen";
import { zActionCreate, zProjectCreate } from "../api/generated/zod.gen";
describe("business view helpers", () => {
  it("combines filters without matching an unrelated supplier", () => {
    const projects: ProjectListItem[] = [
      {
        id: "1",
        pn: "001",
        desc: "Housing",
        plant: "Aschau",
        bu: "Airbag",
        cur: "Nordform",
      },
      {
        id: "2",
        pn: "002",
        desc: "Bracket",
        plant: "Changchun",
        bu: "Seatbelt",
        nw: "Nova",
      },
    ];
    expect(
      filterProjects(projects, "nord", "Aschau", "Airbag", "").map((p) => p.id),
    ).toEqual(["1"]);
    expect(filterProjects(projects, "nord", "Changchun", "", "")).toEqual([]);
  });
  it("permits web documents but rejects executable link schemes", () => {
    expect(safeLink("https://example.com/document")).toBe(
      "https://example.com/document",
    );
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("file:///etc/passwd")).toBeNull();
  });
  it("maps business input types to date, choice and text controls", () => {
    const action = { input_type: "Approval date" } as ActionResponse;
    expect(actionInput(action)).toBe("date");
    expect(
      actionInput({ ...action, input_type: "Scrap / Return / Storage" }),
    ).toBe("select");
    expect(actionInput({ ...action, input_type: "CR number" })).toBe("text");
  });
  it("uses generated backend constraints for required fields and stage bounds", () => {
    expect(zProjectCreate.safeParse({ pn: "", desc: "Test" }).success).toBe(
      false,
    );
    expect(
      zActionCreate.safeParse({
        ph: 8,
        tab: "T",
        act: "A",
        fn: "SDE",
        input_type: "Date",
      }).success,
    ).toBe(false);
  });
});
