import type {
  ProjectListItem,
  ActionResponse,
} from "../api/generated/types.gen";
export const phases = [
  "Tool creation",
  "Development",
  "Internal approval",
  "Customer approval",
  "Scrap & disposition",
  "Archive",
];
export const roles = [
  "BU Buyer",
  "SDE",
  "PM",
  "ENG",
  "SP/BU",
  "Accounting",
] as const;
export const healthLabels: Record<string, string> = {
  green: "Completed",
  red: "Overdue",
  yellow: "Due soon",
  gray: "On track",
};
export function displayDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function filterProjects(
  projects: ProjectListItem[],
  search: string,
  plant: string,
  bu: string,
  health: string,
) {
  return projects.filter(
    (p) =>
      (!search ||
        [p.id, p.pn, p.desc, p.cur, p.nw, p.owner]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!plant || p.plant === plant) &&
      (!bu || p.bu === bu) &&
      (!health || p.summary?.overall_status === health),
  );
}
export function actionInput(action: ActionResponse) {
  return action.input_type.includes(" / ")
    ? "select"
    : /date/i.test(action.input_type)
      ? "date"
      : "text";
}
export function safeLink(value?: string | null) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
