import { test, expect } from "@playwright/test";

test("initial workspace normalizes date history", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction("serverReady && !serverSaving");
  const before = await page.evaluate(
    "projects.flatMap(p=>p.actions).filter(a=>a.orig).length",
  );
  const fot = await page.evaluate(
    "projects.find(p=>p.id==='TR-2026-019').actions.find(a=>a.tab==='FOT Date')",
  );
  expect(before).toBeGreaterThan(0);
  expect(fot.orig).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(fot.value).toBe(fot.orig);
});
