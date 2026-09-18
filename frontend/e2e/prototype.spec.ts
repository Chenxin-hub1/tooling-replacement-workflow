import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const reference = readFileSync(
  new URL(
    "../../.design/reference/tooling-replacement-workflow_3459.html",
    import.meta.url,
  ),
  "utf8",
)
  .replace(
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
    "/vendor/fonts.css",
  )
  .replace(
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    "/vendor/xlsx.full.min.js",
  )
  .replace(
    "Assignment email goes to the owner as soon as the item is added.",
    "Assignment preview only. No email or Teams message is sent.",
  );
const ready = (page: Page) =>
  page.waitForFunction(
    "serverReady && !serverSaving && STORAGE_OK && contentKey(snapshot()) === persistedContent",
  );

async function sameImage(actual: Page, original: Page, name: string) {
  for (const page of [actual, original]) {
    await page.evaluate("document.fonts.ready");
    await page.addStyleTag({
      content:
        "#saveLbl, #saveLbl2 { visibility: hidden !important; } .timeline { display: none !important; }",
    });
    await page.locator("#toast").evaluate((el) => el.classList.remove("show"));
    await page
      .locator("#saveLbl")
      .evaluate((el) => (el.textContent = "Persistence status"));
    await page
      .locator("#saveLbl2")
      .evaluateAll((els) =>
        els.forEach((el) => (el.textContent = "Persistence description")),
      );
    await page.evaluate("document.activeElement?.blur()");
  }
  const options = { fullPage: true, animations: "disabled" as const };
  const a = await actual.screenshot(options);
  const b = await original.screenshot(options);
  mkdirSync("../.design/screenshots/parity", { recursive: true });
  const safeName = name.replace(/[^a-z0-9]/gi, "_");
  writeFileSync(`../.design/screenshots/parity/${safeName}-server.png`, a);
  writeFileSync(`../.design/screenshots/parity/${safeName}-reference.png`, b);
  const differences = await actual.evaluate(
    async ([left, right]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = src;
        });
      const l = await load(left),
        r = await load(right);
      if (l.width !== r.width || l.height !== r.height) return Infinity;
      const canvas = document.createElement("canvas");
      canvas.width = l.width;
      canvas.height = l.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(l, 0, 0);
      const x = context.getImageData(0, 0, l.width, l.height).data;
      context.clearRect(0, 0, l.width, l.height);
      context.drawImage(r, 0, 0);
      const y = context.getImageData(0, 0, l.width, l.height).data;
      let count = 0;
      for (let i = 0; i < x.length; i += 4)
        if (x.slice(i, i + 4).some((v, k) => v !== y[i + k])) count++;
      return count;
    },
    [a, b].map(
      (buffer) => "data:image/png;base64," + buffer.toString("base64"),
    ),
  );
  if (differences > 5) {
    await test
      .info()
      .attach(`${name}-server`, { body: a, contentType: "image/png" });
    await test
      .info()
      .attach(`${name}-reference`, { body: b, contentType: "image/png" });
  }
  expect(
    differences,
    `${name} differs from original pixels`,
  ).toBeLessThanOrEqual(5);
}

test("unchanged desktop views retain the original layout", async ({
  page,
  browser,
}) => {
  const original = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await original.route("**/reference", (route) =>
    route.fulfill({ contentType: "text/html", body: reference }),
  );
  await Promise.all([
    page.clock.setFixedTime(new Date("2026-09-12T08:00:00Z")),
    original.clock.setFixedTime(new Date("2026-09-12T08:00:00Z")),
  ]);
  await page.goto("/");
  await ready(page);
  await original.goto("http://127.0.0.1:5174/reference");
  await expect(original.locator("h1")).toHaveText("Project portfolio");
  expect(await page.evaluate("MATRIX.length")).toBe(31);
  for (const view of ["portfolio", "mine", "mgmt", "admin"]) {
    for (const p of [page, original])
      await p.locator(`[data-v="${view}"]`).click();
    await ready(page);
    await sameImage(page, original, view);
  }
  for (const p of [page, original])
    await p.evaluate("openProject('TR-2026-019')");
  await sameImage(page, original, "project");
  for (const action of [
    "EDIT=true;render()",
    "EDIT=false;render();openAction('TR-2026-019-6')",
    "closeM('act');openAddAction(2)",
    "closeM('act');openWizard()",
    "W.step=1;rWiz()",
  ]) {
    for (const p of [page, original]) await p.evaluate(action);
    await sameImage(page, original, action);
  }
  for (const p of [page, original]) {
    await p.evaluate("closeM('wiz');view='portfolio';render()");
    await p.setViewportSize({ width: 390, height: 844 });
  }
  expect(
    await page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
  ).toBe(true);
  await original.close();
});

test("original edits, admin settings, comments and template changes persist across browsers", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await ready(page);
  await page.locator('[data-v="admin"]').click();
  await page.locator("#apN").fill("Persistence Test");
  await page.locator("#apE").fill("persist@example.test");
  await page
    .locator("#apN")
    .locator("xpath=../..")
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await ready(page);
  await page.evaluate("openProject('TR-2026-019')");
  const row = page
    .locator("tr")
    .filter({ has: page.locator("b", { hasText: /^BPO$/ }) });
  await row.getByPlaceholder("Comment", { exact: true }).fill("Server comment");
  await row.getByPlaceholder("Comment", { exact: true }).press("Tab");
  await ready(page);
  await row.getByRole("button", { name: "Complete", exact: true }).click();
  await page.locator("#aVal").fill("BPO-PERSIST");
  await page.locator("#aCom").fill("Completed on server");
  await page.getByRole("button", { name: "Mark complete" }).click();
  await ready(page);
  await page.evaluate("openAddAction(2)");
  await expect(page.locator("#naTab")).toBeFocused();
  await page.locator("#naTab").fill("Extra check");
  await page.locator("#naAct").fill("Verify fixture");
  await page.locator("#naTpl").check();
  await page
    .locator("#actBody")
    .getByRole("button", { name: "Add item", exact: true })
    .click();
  await ready(page);
  expect(await page.evaluate("MATRIX.length")).toBe(32);
  const saved = await (await page.request.get("/api/workspace")).json();
  expect(saved.snapshot.MATRIX.length).toBe(32);
  const second = await browser.newPage();
  await second.goto("http://127.0.0.1:5174/");
  await ready(second);
  expect(
    await second.evaluate("PEOPLE['BU Buyer'].includes('Persistence Test')"),
  ).toBe(true);
  expect(
    await second.evaluate(
      "projects.find(p=>p.id==='TR-2026-019').actions.find(a=>a.tab==='BPO').value",
    ),
  ).toBe("BPO-PERSIST");
  expect(
    await second.evaluate(
      "projects.find(p=>p.id==='TR-2026-019').actions.find(a=>a.tab==='BPO').comment",
    ),
  ).toBe("Completed on server");
  expect(await second.evaluate("MATRIX.at(-1).tab")).toBe("Extra check");
  await second.close();
});

test("stale page cannot overwrite another browser and failed saves are visible", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await ready(page);
  const second = await browser.newPage();
  await second.goto("http://127.0.0.1:5174/");
  await ready(second);
  await page.evaluate("RULES.before=6;render()");
  await ready(page);
  await second.evaluate("RULES.before=7;render()");
  await expect(second.locator("#saveLbl")).toContainText(
    "Another page changed",
  );
  expect(
    (await (await page.request.get("/api/workspace")).json()).snapshot.RULES
      .before,
  ).toBe(6);
  await second.close();
  await page.route("**/api/workspace", (route) => route.abort());
  await page.evaluate("RULES.before=8;render()");
  await expect(page.locator("#saveLbl")).not.toContainText("Autosaved");
  await page.unroute("**/api/workspace");
  await page.evaluate("autosave()");
  await ready(page);
});

test("original Excel template import and export retain their layout", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Import template", exact: true })
    .click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page
    .locator('input[type=file][accept=".xlsx,.xls,.csv"]')
    .setInputFiles(path!);
  await expect(page.locator("#actBody h2")).toHaveText("Review Excel import");
  await page.locator("#importReviewed").check();
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("Imported: 1 new");
  await ready(page);
  await page.reload();
  await ready(page);
  await expect(page.locator("main")).toContainText("TR-2026-099");
  const workbook = await page.evaluate(`(() => {
    let workbook; const previous = XLSX.writeFile;
    XLSX.writeFile = wb => { workbook = wb; };
    exportPortfolio(); XLSX.writeFile = previous;
    return { names: workbook.SheetNames, rows: XLSX.utils.sheet_to_json(workbook.Sheets.Portfolio) };
  })()`);
  expect(workbook.names).toEqual(["Portfolio", "Status", "Actions", "Teams"]);
  expect(
    workbook.rows.some(
      (row: Record<string, unknown>) =>
        row.Project === "TR-2026-099" && row.CR === "CR-12345",
    ),
  ).toBe(true);
});

test("three-step wizard, reassignment, reminders, reopen and workspace backup use original controls", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page
    .getByRole("button", { name: "+ New project", exact: true })
    .click();
  const fillField = async (name: string, value: string) => {
    const field = page.locator("#wizBody .field").filter({
      has: page.locator("label", { hasText: new RegExp("^" + name) }),
    });
    await field.locator("input").fill(value);
  };
  for (const [name, value] of [
    ["Part Number", "TEST-WIZ"],
    ["Part Description", "Original wizard"],
    ["Plant affected", "Suzhou"],
    ["BU ", "Seatbelt"],
    ["Current Supplier", "Old"],
    ["New Supplier", "New"],
  ])
    await fillField(name, value);
  await page.locator("#wizBody select").evaluateAll((elements) => {
    for (const element of elements) {
      const select = element as HTMLSelectElement;
      if (select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event("change"));
      }
    }
  });
  await page.getByRole("button", { name: "Next: team" }).click();
  await expect(page.locator("#wizBody h2")).toContainText("2 of 3");
  for (const fn of ["SDE", "PM", "ENG", "SP/BU"]) {
    await page
      .locator("#wizBody select")
      .filter({ has: page.locator("option") })
      .evaluateAll((elements, role) => {
        const select = elements.find((el) =>
          el.getAttribute("onchange")?.includes(`W.team['${role}']`),
        ) as HTMLSelectElement;
        select.selectedIndex = 1;
        select.dispatchEvent(new Event("change"));
      }, fn);
  }
  await page.getByRole("button", { name: "Generate action plan" }).click();
  await expect(page.locator("#wizBody h2")).toContainText("3 of 3");
  await page.getByRole("button", { name: "Create project" }).click();
  await ready(page);
  const id = await page.evaluate("current.id");
  await expect(page.locator("h1")).toContainText("Original wizard");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("#edt_SDE").selectOption("Ines Bauer");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await ready(page);
  const row = page
    .locator("#main tr")
    .filter({ has: page.locator("b", { hasText: /^CR$/ }) });
  await expect(row).toContainText("Ines Bauer");
  await row.getByRole("button", { name: "Remind", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview reminder", exact: true })
    .click();
  await ready(page);
  await expect(row).toContainText("previewed");
  await row.getByPlaceholder("CR number", { exact: true }).fill("CR-WIZ");
  await row.getByPlaceholder("CR number", { exact: true }).press("Tab");
  await ready(page);
  await expect(
    row.getByRole("button", { name: "Complete", exact: true }),
  ).toHaveCount(0);
  await row.getByPlaceholder("CR number", { exact: true }).fill("");
  await row.getByPlaceholder("CR number", { exact: true }).press("Tab");
  await ready(page);
  await expect(
    row.getByRole("button", { name: "Complete", exact: true }),
  ).toBeVisible();
  await page.locator('[data-v="admin"]').click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "⬇ Save workspace file" }).click();
  const file = await (await downloadEvent).path();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset to demo data" }).click();
  await ready(page);
  expect(
    await page.evaluate(`projects.some(p=>p.id===${JSON.stringify(id)})`),
  ).toBe(false);
  await page.locator('[data-v="admin"]').click();
  await page.locator('input[type=file][accept=".json"]').setInputFiles(file!);
  await ready(page);
  await expect(page.locator("#toast")).toContainText("Workspace loaded");
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(`projects.some(p=>p.id===${JSON.stringify(id)})`),
  ).toBe(true);
});

test("pending values, invalid dates and zero intervals cannot silently complete actions", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.evaluate("openProject('TR-2026-019');openAction('TR-2026-019-6')");
  await expect(page.locator("#aVal")).toBeFocused();
  await page.locator("#aVal").fill("TBD");
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.locator("#toast")).toContainText("pending value");
  await page.locator("#aVal").fill("BPO-OK");
  await page.locator("#aDate").fill("2099-01-01");
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.locator("#toast")).toContainText("no later than today");
  await page.evaluate("closeM('act');view='settings';render()");
  await expect(page.locator(".note")).toContainText(
    "no email or Teams message is sent",
  );
  const repeat = page.locator(".rule input").nth(1);
  const before = await repeat.inputValue();
  await repeat.fill("0");
  await repeat.press("Tab");
  await expect(repeat).toHaveValue(before);
});

test("spreadsheet preflight preserves ambiguous source cells and does not write before apply", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const before = (await (await page.request.get("/api/workspace")).json())
    .revision;
  const plan = await page.evaluate(`prepareImport([
    ['Part No','Description','Tool Tag','Cavities','FOT Date','PPAP ID','BPW','Status','STATUS'],
    ['SYNTHETIC-ONLY','Import test','TEST-TAG','4','PEND','TBD','BPW-X','Timing','Open']
  ],'synthetic.xlsx','Sheet1')`);
  expect(
    plan.issues.some((issue: { blocking: boolean }) => issue.blocking),
  ).toBe(true);
  const imported = plan.projects.find(
    (p: { pn: string }) => p.pn === "SYNTHETIC-ONLY",
  );
  expect(imported.team).toEqual({});
  expect(imported.actions.every((a: { done: unknown }) => !a.done)).toBe(true);
  expect(imported.importSource.values.slice(-2)).toEqual(["Timing", "Open"]);
  expect(
    (await (await page.request.get("/api/workspace")).json()).revision,
  ).toBe(before);
  const duplicate = await page.evaluate(`prepareImport([
    ['Part No','Description','Created','Tool Tag'],['DUP','Example','2026-01-01','T'],['DUP','Example','2026-01-01','T']
  ],'synthetic.xlsx','Sheet1')`);
  expect(
    duplicate.issues.some((issue: { message: string }) =>
      issue.message.includes("Duplicate"),
    ),
  ).toBe(true);
});

test("timeline milestone labels never overlap or escape the card", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.evaluate("document.fonts.ready");
  await page.evaluate("openProject('TR-2026-019')");
  const measure = () =>
    page.evaluate(() => {
      const card = document.querySelector(".timeline")?.parentElement;
      const cardRect = card?.getBoundingClientRect();
      const spans = [...document.querySelectorAll(".timeline .ms span")];
      const rects = spans.map((s) => s.getBoundingClientRect());
      const overlaps = [];
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i],
            b = rects[j];
          if (!(
            a.left >= b.right - 1 ||
            b.left >= a.right - 1 ||
            a.top >= b.bottom - 1 ||
            b.top >= a.bottom - 1
          ))
            overlaps.push(i + "/" + j);
        }
      const escaped = rects.filter(
        (r) =>
          cardRect &&
          (r.left < cardRect.left - 1 ||
            r.right > cardRect.right + 1 ||
            r.bottom > cardRect.bottom + 1),
      ).length;
      return {
        labels: spans.length,
        overlaps,
        escaped,
        height: document.querySelector(".timeline")?.getBoundingClientRect()
          .height,
      };
    });
  // 默认数据：五个阶段字段齐全、无重叠、不出卡片。
  const normal = await measure();
  expect(normal.labels).toBe(5);
  expect(normal.overlaps).toEqual([]);
  expect(normal.escaped).toBe(0);
  // 强制多个阶段同日结束：分层错开后仍不重叠、不出卡片，且时间线增高。
  await page.evaluate(`(() => {
    const p = projects.find(q => q.id === 'TR-2026-019');
    p.actions.forEach(a => { if (a.ph >= 3) { a.done = null; a.due = d2s(TODAY); } });
    render();
  })()`);
  await ready(page);
  const clustered = await measure();
  expect(clustered.labels).toBe(5);
  expect(clustered.overlaps).toEqual([]);
  expect(clustered.escaped).toBe(0);
  expect(clustered.height as number).toBeGreaterThan(normal.height as number);
});

test("calendar advances at midnight without changing project creation dates", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-15T08:00:00Z"));
  await page.goto("/");
  await ready(page);
  await page.evaluate(
    `W={d:{pn:'DATE-TEST',desc:'Date test'},team:{'BU Buyer':'Carrie Chen'}};createProject()`,
  );
  await ready(page);
  const created = await page.evaluate("d2s(current.created)");
  await page.clock.setFixedTime(new Date("2026-09-16T08:00:00Z"));
  await page.evaluate("refreshCalendar()");
  expect(await page.evaluate("d2s(TODAY)")).toBe("2026-09-16");
  expect(await page.evaluate("d2s(current.created)")).toBe(created);
});

test("mobile views and dialogs stay inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await ready(page);
  for (const view of ["portfolio", "mine", "mgmt", "settings", "admin"]) {
    await page.locator(`[data-v="${view}"]`).click();
    expect(
      await page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
    ).toBe(true);
  }
  await page.evaluate("openProject('TR-2026-019')");
  expect(
    await page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
  ).toBe(true);
  await page.evaluate("openAddAction(2)");
  expect(
    await page
      .locator("#act .modal")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "../.design/screenshots/mobile-optimized.png",
    fullPage: true,
  });
});

test("a failed save leaves a recoverable local backup after reload", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await page.evaluate("projects[0].desc='Unsaved synthetic change';render()");
  await page.waitForFunction("!STORAGE_OK && localStorage.getItem(BACKUP_KEY)");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await ready(page);
  await page.locator('[data-v="admin"]').click();
  await expect(
    page.getByRole("button", { name: "Download unsaved backup" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      "JSON.parse(localStorage.getItem(BACKUP_KEY)).snapshot.projects[0].desc",
    ),
  ).toBe("Unsaved synthetic change");
});

test("long dependency chains schedule correctly and incomplete progress stays below 100%", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  expect(
    await page.evaluate(`(() => {
    const p={created:new Date('2026-01-01'),actions:[
      {id:'c',dep:'b',lead:1,done:null},{id:'b',dep:'a',lead:1,done:null},
      {id:'a',dep:'root',lead:1,done:null},{id:'root',dep:null,lead:1,done:null}
    ]};schedule(p);return p.actions[0].due;
  })()`),
  ).toBe("2026-01-05");
  expect(
    await page.evaluate(`(() => {
    const p={created:new Date('2026-01-01'),actions:Array.from({length:201},(_,i)=>({ph:1,done:i?'2026-01-02':null,due:'',lead:0,leadDefault:0}))};return summary(p).pct;
  })()`),
  ).toBe(99);
});
