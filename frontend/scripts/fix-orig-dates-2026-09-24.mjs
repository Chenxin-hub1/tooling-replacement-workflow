// 2026-09-24 日期格修复后的一次性修正：16 个双日期动作的原始日期仍是旧的偏移值（比当前值恰好早一天），
// 按页面 Admin "Correct original" 的同一写法批量改正并在 origLog 留痕。只处理 orig 比 value 早一天的动作，其余跳过并列出。
// 用法：先启动服务 TOOLING_PORT=8765 ./scripts/start.sh，再 cd frontend && node scripts/fix-orig-dates-2026-09-24.mjs
// 产物：.demo/reimport-source-dates-2026-09-24/{orig-corrections,after-orig-fix}.json
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.REIMPORT_URL ?? "http://localhost:8765";
const OUT = new URL(
  "../../.demo/reimport-source-dates-2026-09-24/",
  import.meta.url,
);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE);
await page.waitForFunction(
  "serverReady && !serverSaving && contentKey(snapshot()) === persistedContent",
);
const result = await page.evaluate(() => {
  const fixed = [];
  for (const p of projects)
    for (const a of p.actions) {
      if (
        !Workflow.dateHistoryRule(a.ph, a.tab, a.act) ||
        !a.orig ||
        !a.value ||
        a.orig === a.value
      )
        continue;
      const gap = (Date.parse(a.value) - Date.parse(a.orig)) / 86400000;
      if (gap !== 1) {
        fixed.push({
          project: p.id,
          tab: a.tab,
          skipped: true,
          orig: a.orig,
          value: a.value,
        });
        continue;
      }
      (a.origLog = a.origLog || []).push({
        ts: new Date().toISOString(),
        by: "System — UTC date-cell fix 2026-09-24",
        from: a.orig,
        to: a.value,
      });
      a.orig = a.value;
      fixed.push({
        project: p.id,
        tab: a.tab,
        from: a.origLog.at(-1).from,
        to: a.value,
      });
    }
  render();
  return fixed;
});
await page.evaluate("autosave()");
await page.waitForFunction(
  "serverReady && !serverSaving && STORAGE_OK && contentKey(snapshot()) === persistedContent",
  null,
  { timeout: 60000 },
);
await browser.close();

const after = await (await fetch(`${BASE}/api/workspace`)).json();
writeFileSync(
  new URL("after-orig-fix.json", OUT),
  JSON.stringify(after, null, 2),
);
writeFileSync(
  new URL("orig-corrections.json", OUT),
  JSON.stringify(result, null, 2),
);
const stillStale = after.snapshot.projects.flatMap((p) =>
  p.actions
    .filter((a) => a.orig && a.value && a.orig !== a.value)
    .map((a) => [p.id, a.tab, a.orig, a.value]),
);
console.log(
  JSON.stringify(
    {
      corrected: result.filter((r) => !r.skipped).length,
      skipped: result.filter((r) => r.skipped),
      revision: after.revision,
      stillStale,
    },
    null,
    2,
  ),
);
