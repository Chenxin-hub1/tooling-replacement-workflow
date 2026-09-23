// 一次性/可复用重导驱动：把工作区里 IMP-* 项目的 importSource 原文行，经真实页面
// 的 prepareImport → 预览 → applyImport 链路重放（服务端做 schema 校验、revision CAS
// 与落库快照）。用于 2026-09-22 新规则重导与 2026-09-23 BPW/CVS CR/OEM - Tech 映射
// 落地（docs/bpw-mapping-2026-09-23.md）。
//
// 用法：先启动服务（如 TOOLING_PORT=8765 ./scripts/start.sh），再执行
//   cd frontend && node scripts/reimport-workspace.mjs <输出目录名>
// 输出目录名默认 reimport-<今天日期>，产物为 .demo/<目录>/{before,after,report}.json；
// 写库前先做 SQLite 在线备份 .demo/before-<目录>.db。
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const BASE = process.env.REIMPORT_URL ?? "http://localhost:8765";
const ROOT = new URL("../../", import.meta.url);
const OUT_NAME = process.argv[2] ?? `reimport-${new Date().toISOString().slice(0, 10)}`;
const OUT_DIR = new URL(`.demo/${OUT_NAME}/`, ROOT);
const BACKUP_DB = new URL(`.demo/before-${OUT_NAME}.db`, ROOT);
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${cmd} ${args} failed (${result.status})`);
};

// 1) 预检与备份
const health = await (await fetch(`${BASE}/health`)).json();
if (health.status !== "healthy") throw new Error(`Server not healthy: ${JSON.stringify(health)}`);
run("python3", [fileURLToPath(new URL("scripts/backup-sqlite.py", ROOT)), fileURLToPath(new URL("backend/tooling.db", ROOT)), fileURLToPath(BACKUP_DB)]);
const before = await (await fetch(`${BASE}/api/workspace`)).json();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(new URL("before.json", OUT_DIR), JSON.stringify(before, null, 2));

// 2) 真实页面内重放导入计划
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE);
await page.waitForFunction("serverReady");
const planInfo = await page.evaluate(async () => {
  const imported = projects.filter((p) => p.id.startsWith("IMP-") && p.importSource);
  const originals = new Map(imported.map((p) => [p.id, structuredClone(p.importSource)]));
  // 每行显式注入原 Project ID 与 Created（缺省会误用当天日期）；按原行号排序保持 row 不变。
  const sorted = [...imported].sort((a, b) => a.importSource.row - b.importSource.row);
  const headers = ["Project ID", "Created", ...sorted[0].importSource.headers];
  const rows = [headers, ...sorted.map((p) => [p.id, p.created, ...p.importSource.values])];
  const base = contentKey(snapshot());
  const plan = await prepareImport(rows, originals.get(sorted[0].id).filename, originals.get(sorted[0].id).sheet, "2026-09-18");
  for (const project of plan.projects) {
    const original = originals.get(project.id);
    if (original) project.importSource = structuredClone(original);
  }
  pendingImport = { rows, filename: originals.get(sorted[0].id).filename, sheet: originals.get(sorted[0].id).sheet, fallbackDate: "2026-09-18", base, plan };
  showImportPreview();
  const count = (fn) => plan.projects.filter((p) => p.id.startsWith("IMP-")).reduce((n, p) => n + p.actions.filter(fn).length, 0);
  return {
    blocking: plan.issues.filter((i) => i.blocking),
    imported: plan.projects.filter((p) => p.id.startsWith("IMP-")).length,
    coreBpwValues: count((a) => a.tab === "Core BPW" && a.act === "Input BPW number" && a.value),
    oemBpwValues: count((a) => a.tab === "OEM BPW" && a.act === "Identify BPW number" && a.value),
    cvsValues: count((a) => a.tab === "CVS CR" && a.act === "Input CR number for CVS on Windchill" && a.value),
    initiated: count((a) => Workflow.statusRule(a.ph, a.tab, a.act) && a.status === "initiated"),
    assumedCore: plan.projects.filter((p) => p.id.startsWith("IMP-") && p.importWarnings?.some((w) => w.includes("assumed Core"))).length,
    techFilled: plan.projects.filter((p) => p.id.startsWith("IMP-") && p.tech).length,
    doneActions: plan.projects.filter((p) => p.id.startsWith("IMP-")).reduce((n, p) => n + p.actions.filter((a) => a.done).length, 0),
    allIds: plan.projects.map((p) => p.id),
  };
});
if (planInfo.blocking.length) {
  await browser.close();
  throw new Error(`Blocking import issues — nothing applied: ${JSON.stringify(planInfo.blocking.slice(0, 5))}`);
}

// 3) 走真实 UI 应用（applyImport 内部校验 base 未变并保存整工作区）
await page.locator("#importReviewed").check();
await page.locator("#importApply").click();
await page.waitForFunction(
  "serverReady && !serverSaving && contentKey(snapshot()) === persistedContent",
  null,
  { timeout: 30000 },
);
await browser.close();

// 4) 事后核验
const after = await (await fetch(`${BASE}/api/workspace`)).json();
const quickCheck = spawnSync("python3", ["-c", "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('PRAGMA quick_check').fetchone()[0])", fileURLToPath(new URL("backend/tooling.db", ROOT))], { encoding: "utf8" });
const beforeImported = before.snapshot.projects.filter((p) => p.id.startsWith("IMP-"));
const afterImported = after.snapshot.projects.filter((p) => p.id.startsWith("IMP-"));
const nonImportedBefore = before.snapshot.projects.filter((p) => !p.id.startsWith("IMP-"));
const nonImportedAfter = after.snapshot.projects.filter((p) => !p.id.startsWith("IMP-"));
const pick = (p, tab, act) => p.actions.find((a) => a.tab === tab && a.act === act);
const report = {
  method: "actual page prepareImport via Playwright; replay stored importSource rows with explicit Project ID and Created; original importSource restored verbatim",
  code_sha256: {
    "workflow-core.js": sha256(new URL("../public/workflow-core.js", import.meta.url)),
    "prototype.js": sha256(new URL("../public/prototype.js", import.meta.url)),
    "improvements.js": sha256(new URL("../public/improvements.js", import.meta.url)),
  },
  created_at: new Date().toISOString(),
  source_revision: before.revision,
  applied_revision: after.revision,
  backup: `.demo/before-${OUT_NAME}.db`,
  database_integrity: quickCheck.stdout.trim(),
  blocking_issues: planInfo.blocking.length,
  imported_projects: afterImported.length,
  all_project_ids_preserved:
    JSON.stringify(before.snapshot.projects.map((p) => p.id)) === JSON.stringify(after.snapshot.projects.map((p) => p.id)),
  non_imported_projects_unchanged:
    JSON.stringify(nonImportedBefore) === JSON.stringify(nonImportedAfter),
  all_action_ids_and_dependencies_preserved: beforeImported.every((b) => {
    const a = afterImported.find((x) => x.id === b.id);
    return JSON.stringify(b.actions.map((x) => [x.id, x.dep])) === JSON.stringify(a.actions.map((x) => [x.id, x.dep]));
  }),
  imported_done_before: beforeImported.reduce((n, p) => n + p.actions.filter((a) => a.done).length, 0),
  imported_done_after: afterImported.reduce((n, p) => n + p.actions.filter((a) => a.done).length, 0),
  plan_core_bpw_values: planInfo.coreBpwValues,
  plan_oem_bpw_values: planInfo.oemBpwValues,
  plan_cvs_values: planInfo.cvsValues,
  plan_initiated_statuses: planInfo.initiated,
  plan_assumed_core_warnings: planInfo.assumedCore,
  plan_tech_filled: planInfo.techFilled,
  after_core_bpw_values: afterImported.filter((p) => pick(p, "Core BPW", "Input BPW number").value).length,
  after_oem_bpw_values: afterImported.filter((p) => pick(p, "OEM BPW", "Identify BPW number").value).length,
  after_cvs_values: afterImported.filter((p) => pick(p, "CVS CR", "Input CR number for CVS on Windchill").value).length,
  after_tech_filled: afterImported.filter((p) => p.tech).length,
  after_initiated_statuses: afterImported.reduce((n, p) => n + p.actions.filter((a) => a.status === "initiated").length, 0),
};
writeFileSync(new URL("after.json", OUT_DIR), JSON.stringify(after, null, 2));
writeFileSync(new URL("report.json", OUT_DIR), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const failures = Object.entries(report).filter(([key, value]) =>
  key.endsWith("_preserved") || key.endsWith("_unchanged") ? value !== true : false,
);
if (report.database_integrity !== "ok" || failures.length || report.blocking_issues) {
  throw new Error(`Verification failed: ${failures.map(([k]) => k).join(", ")} / integrity=${report.database_integrity}`);
}
console.log(`\nReimport applied. Revision ${report.source_revision} -> ${report.applied_revision}. Backup: ${report.backup}`);
