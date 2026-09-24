import { test, expect, type Page } from "@playwright/test";

const ready = (page: Page) =>
  page.waitForFunction(
    "serverReady && !serverSaving && STORAGE_OK && contentKey(snapshot()) === persistedContent",
  );
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.evaluate(
    "restore(structuredClone(defaultWorkspace));view='portfolio';render()",
  );
  await ready(page);
});

test("four phases, approval filters and clear work together", async ({
  page,
}) => {
  expect(await page.evaluate("PHASES.length")).toBe(4);
  expect(await page.evaluate("MATRIX.length")).toBe(20);
  expect(
    await page.evaluate("projects.every(p=>p.actions.every(a=>a.ph<4))"),
  ).toBe(true);
  await expect(page.locator(".rail6").first().locator("i")).toHaveCount(4);
  await page.evaluate(
    "projects[0].actions.find(a=>a.tab==='PPAP Status').value='Interim approved';projects[0].actions.filter(a=>['Core BPW','Pre Grain','AAR'].includes(a.tab)&&Workflow.statusRule(a.ph,a.tab,a.act)).forEach(a=>a.status='in_progress');render()",
  );
  for (const [label, value] of [
    ["PPAP Status", "interim"],
    ["BPW", "in_progress"],
    ["Pre Grain", "in_progress"],
    ["AAR", "in_progress"],
  ]) {
    await page
      .locator(`select[aria-label="${label}"]`)
      .selectOption(value, { force: true });
  }
  expect(await page.evaluate("filteredProjects().map(p=>p.id)")).toEqual([
    "TR-2026-014",
  ]);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  expect(await page.evaluate("filteredProjects().length")).toBe(6);
});

test("restoring an older workspace moves both CVS CR actions into Development without losing data", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    (window as any).eval(`(()=>{
    const legacy=structuredClone(snapshot());
    legacy.MATRIX.filter(a=>a.tab==='CVS CR').forEach(a=>a.ph=2);
    legacy.projects.forEach(p=>p.actions.filter(a=>a.tab==='CVS CR').forEach(a=>a.ph=2));
    const actions=legacy.projects[0].actions.filter(a=>a.tab==='CVS CR');
    const cr=actions.find(a=>a.input==='CR number');cr.value='CVS-LEGACY';cr.status='approved';cr.done='2026-05-01';
    const before=structuredClone(actions);
    restore(legacy);render();
    return {before,after:projects[0].actions.filter(a=>a.tab==='CVS CR'),template:MATRIX.filter(a=>a.tab==='CVS CR')};
  })()`),
  );
  expect(result.after).toEqual(
    result.before.map((action: Record<string, unknown>) => ({
      ...action,
      ph: 1,
    })),
  );
  expect(result.template).toHaveLength(2);
  expect(
    result.template.every((action: { ph: number }) => action.ph === 1),
  ).toBe(true);
  await ready(page);
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate("projects[0].actions.filter(a=>a.tab==='CVS CR')"),
  ).toEqual(result.after);
});

test("invalid completion leaves the entire action unchanged", async ({
  page,
}) => {
  await page.evaluate(
    "openProject('TR-2026-019');openAction(current.actions.find(a=>a.tab==='CR').id)",
  );
  const before = await page.evaluate("structuredClone(actTarget.a)");
  await page.locator("#aVal").fill("CR-INVALID-CHANGE");
  await page.locator("#aStatus").selectOption("approved");
  await page.locator("#aDate").fill("2099-01-01");
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await expect(page.locator("#toast")).toContainText(
    "valid actual completion date",
  );
  expect(await page.evaluate("actTarget.a")).toEqual(before);
  await page.evaluate("closeM('act')");
});

test("inline information stays open, explicit completion persists, and changed information reopens it", async ({
  page,
}) => {
  await page.evaluate(`openProject('TR-2026-019');
    current.actions.forEach(a=>{a.done=null;a.value='';delete a.status;});
    insertAction({ph:1,tab:'Supplier follow-up',act:'Record supplier response',input:'Response',fn:'SDE',owner:current.team.SDE,lead:7,dep:null});
    render()`);
  for (const [tab, input, value] of [
    ["PPAP ID", "PPAP ID", "PPAP-REVIEW-123"],
    ["BPO", "BPO number", "BPO-REVIEW-123"],
    ["FOT Date", "Date", "2026-11-01"],
    ["PPAP Sample Date", "Date", "2026-11-02"],
    ["PPAP Submission Date", "Date", "2026-11-03"],
    ["OEM BPW", "Date", "2026-11-04"],
    ["Supplier follow-up", "Response", "Supplier response received"],
  ]) {
    const row = page
      .locator("tbody tr")
      .filter({ has: page.locator("b", { hasText: new RegExp(`^${tab}$`) }) })
      .filter({ has: page.locator(`input[placeholder="${input}"]`) });
    await row.locator(`input[placeholder="${input}"]`).fill(value);
    await row.locator(`input[placeholder="${input}"]`).blur();
    expect(
      await page.evaluate(
        ({ tab, input }) =>
          (window as any).eval(
            `current.actions.find(a=>a.tab===${JSON.stringify(tab)}&&a.input===${JSON.stringify(input)}).done`,
          ),
        { tab, input },
      ),
    ).toBeNull();
    await expect(row.locator(".st")).not.toHaveText("Complete");
  }
  await page.evaluate(
    "openAction(current.actions.find(a=>a.tab==='PPAP ID').id)",
  );
  await expect(page.locator("#aVal")).toHaveValue("PPAP-REVIEW-123");
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  const completed = await page.evaluate(
    "current.actions.find(a=>a.tab==='PPAP ID').done",
  );
  expect(completed).toBeTruthy();
  await page.evaluate(
    "setValue(current.actions.findIndex(a=>a.tab==='PPAP ID'),'PPAP-REVIEW-123')",
  );
  expect(
    await page.evaluate("current.actions.find(a=>a.tab==='PPAP ID').done"),
  ).toBe(completed);
  await ready(page);
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(
      "projects.find(p=>p.id==='TR-2026-019').actions.find(a=>a.tab==='PPAP ID').done",
    ),
  ).toBe(completed);
  await page.evaluate("openProject('TR-2026-019')");
  const ppap = page.locator('input[placeholder="PPAP ID"]');
  await ppap.fill("PPAP-REVIEW-456");
  await ppap.blur();
  expect(
    await page.evaluate("current.actions.find(a=>a.tab==='PPAP ID').done"),
  ).toBeNull();
  await ready(page);
});

test("saving information in the Dates dialog logs reschedules without completing the action", async ({
  page,
}) => {
  await page.evaluate(`openProject('TR-2026-019');const a=current.actions.find(a=>a.tab==='FOT Date');
    a.value='';a.done=null;delete a.orig;delete a.dateLog;openAction(a.id)`);
  await page.locator("#aVal").fill("2026-04-01");
  await page
    .getByRole("button", { name: "Save information", exact: true })
    .click();
  const row = page
    .locator("tbody tr")
    .filter({ has: page.locator("b", { hasText: /^FOT Date$/ }) });
  await row.getByRole("button", { name: "Dates", exact: true }).click();
  await page.locator("#aVal").fill("2026-11-01");
  await page
    .getByRole("button", { name: "Save information", exact: true })
    .click();
  await row.getByRole("button", { name: "Dates", exact: true }).click();
  await expect(page.locator("#actBody")).toContainText(
    "Current date history (2)",
  );
  await expect(page.locator("#actBody")).toContainText("2026-04-01");
  await expect(page.locator("#actBody")).toContainText("2026-11-01");
  expect(await page.evaluate("actTarget.a")).toMatchObject({
    orig: "2026-04-01",
    value: "2026-11-01",
    done: null,
  });
  await page
    .getByRole("button", { name: "Save information", exact: true })
    .click();
  expect(
    await page.evaluate(
      "current.actions.find(a=>a.tab==='FOT Date').dateLog.length",
    ),
  ).toBe(2);
  await ready(page);
});

test("PPAP dialog saves non-final statuses and explicitly completes Full approved with a valid date", async ({
  page,
}) => {
  await page.evaluate(
    "openProject('TR-2026-019');const a=current.actions.find(a=>a.tab==='PPAP Status');a.value='';a.done=null;render()",
  );
  const crBefore = await page.evaluate(
    "structuredClone(current.actions.find(a=>a.tab==='CR'))",
  );
  for (const [value, portfolio] of [
    ["Draft", "draft"],
    ["Interim approved", "interim"],
  ]) {
    await page.evaluate(
      "openAction(current.actions.find(a=>a.tab==='PPAP Status').id)",
    );
    await expect(
      page.getByRole("button", { name: "Save information", exact: true }),
    ).toHaveCount(0);
    await page.locator("#aVal").selectOption(value, { force: true });
    await page
      .getByRole("button", { name: "Save status", exact: true })
      .click();
    expect(
      await page.evaluate("current.actions.find(a=>a.tab==='PPAP Status')"),
    ).toMatchObject({ value, done: null });
    expect(
      await page.evaluate("Workflow.portfolioStatus(current,'ppap')"),
    ).toBe(portfolio);
  }
  await page.evaluate(
    "openAction(current.actions.find(a=>a.tab==='PPAP Status').id)",
  );
  await page.locator("#aVal").selectOption("Full approved", { force: true });
  await expect(
    page.getByRole("button", { name: "Save information", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save status", exact: true }),
  ).toHaveCount(0);
  await page.locator("#aDate").fill("2099-01-01");
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await expect(page.locator("#toast")).toContainText(
    "valid actual completion date",
  );
  expect(await page.evaluate("actTarget.a")).toMatchObject({
    value: "Interim approved",
    done: null,
  });
  const actual = await page.evaluate("d2s(TODAY)");
  await page.locator("#aDate").fill(actual);
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  expect(
    await page.evaluate("current.actions.find(a=>a.tab==='PPAP Status')"),
  ).toMatchObject({ value: "Full approved", done: actual });
  expect(await page.evaluate("Workflow.portfolioStatus(current,'ppap')")).toBe(
    "approved",
  );
  expect(await page.evaluate("current.actions.find(a=>a.tab==='CR')")).toEqual(
    crBefore,
  );
  await ready(page);
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(
      "projects.find(p=>p.id==='TR-2026-019').actions.find(a=>a.tab==='PPAP Status')",
    ),
  ).toMatchObject({ value: "Full approved", done: actual });
  expect(
    await page.evaluate(
      "Workflow.portfolioStatus(projects.find(p=>p.id==='TR-2026-019'),'ppap')",
    ),
  ).toBe("approved");
  expect(
    await page.evaluate(
      "projects.find(p=>p.id==='TR-2026-019').actions.find(a=>a.tab==='CR')",
    ),
  ).toEqual(crBefore);
});

test("approval needs a value and editing approved information requires approval again", async ({
  page,
}) => {
  await page.evaluate(`openProject('TR-2026-019');current.actions.forEach(a=>{
    if(Workflow.statusRule(a.ph,a.tab,a.act)){a.value='';a.done=null;a.status='';}
  });render()`);
  for (const [tab, input, first, revised] of [
    ["CR", "CR number", "CR-123", "CR-456"],
    ["CVS CR", "CR number", "CVS-123", "CVS-456"],
    ["Core BPW", "BPW number", "BPW-123", "BPW-456"],
    ["Pre Grain", "Date", "2026-04-01", "2026-11-01"],
    ["AAR", "Date", "2026-04-02", "2026-11-02"],
  ]) {
    const row = page
      .locator("tbody tr")
      .filter({ has: page.locator("b", { hasText: new RegExp(`^${tab}$`) }) })
      .filter({ has: page.locator(`input[placeholder="${input}"]`) });
    await row
      .locator('select[title="Approval status"]')
      .selectOption("approved", { force: true });
    expect(
      await page.evaluate(
        ({ tab, input }) =>
          (window as any).eval(
            `current.actions.find(a=>a.tab===${JSON.stringify(tab)}&&a.input===${JSON.stringify(input)}).done`,
          ),
        { tab, input },
      ),
    ).toBeNull();
    await row.locator(`input[placeholder="${input}"]`).fill(first);
    await row.locator(`input[placeholder="${input}"]`).blur();
    expect(
      await page.evaluate(
        ({ tab, input }) =>
          (window as any).eval(
            `current.actions.find(a=>a.tab===${JSON.stringify(tab)}&&a.input===${JSON.stringify(input)}).done`,
          ),
        { tab, input },
      ),
    ).toBeNull();
    for (const status of ["initiated", "in_progress"]) {
      await row
        .locator('select[title="Approval status"]')
        .selectOption(status, { force: true });
      expect(
        await page.evaluate(
          ({ tab, input }) =>
            (window as any).eval(
              `current.actions.find(a=>a.tab===${JSON.stringify(tab)}&&a.input===${JSON.stringify(input)}).done`,
            ),
          { tab, input },
        ),
      ).toBeNull();
    }
    await row
      .locator('select[title="Approval status"]')
      .selectOption("approved", { force: true });
    expect(
      await page.evaluate(
        ({ tab, input }) =>
          (window as any).eval(
            `current.actions.find(a=>a.tab===${JSON.stringify(tab)}&&a.input===${JSON.stringify(input)}).done`,
          ),
        { tab, input },
      ),
    ).toBeTruthy();
    await row.locator(`input[placeholder="${input}"]`).fill(revised);
    await row.locator(`input[placeholder="${input}"]`).blur();
    expect(
      await page.evaluate(
        ({ tab, input }) =>
          (window as any).eval(
            `current.actions.find(a=>a.tab===${JSON.stringify(tab)}&&a.input===${JSON.stringify(input)})`,
          ),
        { tab, input },
      ),
    ).toMatchObject({ value: revised, done: null, status: "in_progress" });
  }
  await ready(page);
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(
      "projects.find(p=>p.id==='TR-2026-019').actions.filter(a=>Workflow.statusRule(a.ph,a.tab,a.act)).every(a=>a.done===null&&a.status==='in_progress')",
    ),
  ).toBe(true);
});

test("all six original dates and complete reschedule histories persist after clearing and reload", async ({
  page,
}) => {
  await page.evaluate(`openProject('TR-2026-019');current.actions.forEach((a,i)=>{
    if(Workflow.dateHistoryRule(a.ph,a.tab,a.act)) {a.value='';a.done=null;delete a.orig;delete a.dateLog;setValue(i,'2026-11-01');setValue(i,'2026-11-02');setValue(i,'');setValue(i,'2026-11-03');setValue(i,'2026-11-03');}
  });render()`);
  await ready(page);
  const result = await page.evaluate(
    "current.actions.filter(a=>Workflow.dateHistoryRule(a.ph,a.tab,a.act)).map(a=>({orig:a.orig,value:a.value,done:a.done,dateLog:a.dateLog}))",
  );
  expect(result).toMatchObject(
    Array.from({ length: 6 }, () => ({
      orig: "2026-11-01",
      value: "2026-11-03",
      done: null,
      dateLog: [
        {
          from: "",
          to: "2026-11-01",
          by: expect.any(String),
          ts: expect.any(String),
          source: "edit",
        },
        { from: "2026-11-01", to: "2026-11-02", source: "edit" },
        { from: "2026-11-02", to: "", source: "edit" },
        { from: "", to: "2026-11-03", source: "edit" },
      ],
    })),
  );
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(
      "projects.find(p=>p.id==='TR-2026-019').actions.filter(a=>Workflow.dateHistoryRule(a.ph,a.tab,a.act)).map(a=>({orig:a.orig,value:a.value,done:a.done,dateLog:a.dateLog}))",
    ),
  ).toEqual(result);
});

test("exported Excel retains approval and full date history in a fresh import", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    return await (window as any).eval(`(async()=>{
      const p=projects.find(p=>p.id==='TR-2026-019');
      const a=p.actions.find(a=>a.tab==='Pre Grain'&&a.input==='Date');
      a.value='2026-11-03';a.orig='2026-11-01';a.status='in_progress';a.done=null;
      a.dateLog=[
        {ts:'2026-09-15T08:00:00.000Z',by:'Carrie Chen',from:'',to:'2026-11-01',source:'edit'},
        {ts:'2026-09-15T09:00:00.000Z',by:'Carrie Chen',from:'2026-11-01',to:'2026-11-03',source:'edit'},
      ];
      const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet([flatRow(p)]),'Project');
      const parsed=XLSX.read(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),{type:'array'});
      const rows=XLSX.utils.sheet_to_json(parsed.Sheets.Project,{header:1,defval:''});
      projects=projects.filter(project=>project.id!==p.id);
      const plan=await prepareImport(rows,'roundtrip.xlsx','Project');
      return {errors:plan.issues.filter(x=>x.blocking),action:plan.projects.find(x=>x.id===p.id).actions.find(x=>x.tab===a.tab&&x.input===a.input),version:XLSX.version};
    })()`);
  });
  expect(result.version).toBe("0.20.3");
  expect(result.errors).toEqual([]);
  expect(result.action).toMatchObject({
    orig: "2026-11-01",
    value: "2026-11-03",
    status: "in_progress",
    done: null,
    dateLog: [
      {
        ts: "2026-09-15T08:00:00.000Z",
        by: "Carrie Chen",
        from: "",
        to: "2026-11-01",
        source: "edit",
      },
      {
        ts: "2026-09-15T09:00:00.000Z",
        by: "Carrie Chen",
        from: "2026-11-01",
        to: "2026-11-03",
        source: "edit",
      },
    ],
  });
});

test("spreadsheet changes reopen old approvals and append current-date history", async ({
  page,
}) => {
  const result = await page.evaluate(async () =>
    (window as any).eval(`(async()=>{
    const p=projects.find(project=>project.id==='TR-2026-019');
    const id=p.actions.find(a=>a.tab==='PPAP ID');id.value='PPAP-OLD';id.done='2026-05-01';
    const cr=p.actions.find(a=>a.tab==='CR');cr.value='CR-OLD';cr.status='approved';cr.done='2026-05-01';
    const fot=p.actions.find(a=>a.tab==='FOT Date');fot.value='2026-04-01';fot.orig='2026-04-01';fot.done='2026-05-01';
    fot.dateLog=[{ts:'2026-03-01T08:00:00.000Z',by:'Carrie Chen',from:'',to:'2026-04-01',source:'edit'}];
    const plan=await prepareImport([
      ['Project ID','Part Number','PPAP ID',colName(cr,p.actions),'FOT Date'],
      [p.id,p.pn,'PPAP-NEW','CR-NEW','2026-11-01'],
    ],'updated.xlsx','Project');
    const updated=plan.projects.find(project=>project.id===p.id);
    return {errors:plan.issues.filter(issue=>issue.blocking),actions:updated.actions.filter(a=>[id.id,cr.id,fot.id].includes(a.id))};
  })()`),
  );
  expect(result.errors).toEqual([]);
  expect(result.actions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        tab: "PPAP ID",
        value: "PPAP-NEW",
        done: null,
      }),
      expect.objectContaining({
        tab: "CR",
        value: "CR-NEW",
        done: null,
      }),
      expect.objectContaining({
        tab: "FOT Date",
        value: "2026-11-01",
        orig: "2026-04-01",
        done: null,
        dateLog: [
          {
            ts: "2026-03-01T08:00:00.000Z",
            by: "Carrie Chen",
            from: "",
            to: "2026-04-01",
            source: "edit",
          },
          expect.objectContaining({
            from: "2026-04-01",
            to: "2026-11-01",
            source: "import",
          }),
        ],
      }),
    ]),
  );
  expect(
    result.actions.find((action: { tab: string }) => action.tab === "CR")
      .status,
  ).not.toBe("approved");
});

test("reimporting unchanged legacy information re-evaluates completion while preserving history and unrelated records", async ({
  page,
}) => {
  const result = await page.evaluate(async () =>
    (window as any).eval(`(async()=>{
    const p=projects.find(project=>project.id==='TR-2026-019');
    p.importSource={filename:'legacy.xlsx',sheet:'Project',row:2,headers:['Part Number'],values:[p.pn]};
    const selected=p.actions.filter(a=>['PPAP ID','BPO'].includes(a.tab)||Workflow.statusRule(a.ph,a.tab,a.act)||Workflow.dateHistoryRule(a.ph,a.tab,a.act));
    for(const a of selected){
      a.value=a.input==='Date'?'2026-04-01':'LEGACY-'+a.id;a.done='2026-04-02';
      if(Workflow.statusRule(a.ph,a.tab,a.act))a.status='approved';
      if(Workflow.dateHistoryRule(a.ph,a.tab,a.act)){
        a.orig='2026-04-01';
        a.dateLog=[{ts:'2026-03-01T08:00:00.000Z',by:'Carrie Chen',from:'',to:'2026-04-01',source:'edit'}];
      }
    }
    const custom={...structuredClone(p.actions.find(a=>a.tab==='PPAP ID')),id:p.id+'-c99',tab:'Custom retained item',act:'Retain supplier follow-up',input:'Response',value:'Confirmed response',custom:true,creator:me,createdOn:d2s(TODAY),dep:null};
    p.actions.push(custom);
    const row={'Project ID':p.id,'Part Number':p.pn};
    for(const a of selected)row[colName(a,p.actions)]=a.value;
    const before=structuredClone(selected),others=structuredClone(projects.filter(project=>project.id!==p.id));
    const rows=[Object.keys(row),Object.values(row)],base=contentKey(snapshot());
    const plan=await prepareImport(rows,'legacy.xlsx','Project');
    pendingImport={rows,filename:'legacy.xlsx',sheet:'Project',fallbackDate:'',base,plan};showImportPreview();
    const updated=plan.projects.find(project=>project.id===p.id);
    return {errors:plan.issues.filter(issue=>issue.blocking),before,after:updated.actions.filter(a=>selected.some(old=>old.id===a.id)),custom,customAfter:updated.actions.find(a=>a.id===custom.id),others,othersAfter:plan.projects.filter(project=>project.id!==p.id)};
  })()`),
  );
  expect(result.errors).toEqual([]);
  expect(result.after).toHaveLength(11);
  for (const action of result.after) {
    const before = result.before.find(
      (old: { id: string }) => old.id === action.id,
    );
    expect(action.value).toBe(before.value);
    expect(action.done).toBeNull();
    expect(action.status).not.toBe("approved");
    expect(action.orig).toBe(before.orig);
    expect(action.dateLog).toEqual(before.dateLog);
  }
  expect(result.customAfter).toEqual(result.custom);
  expect(result.othersAfter).toEqual(result.others);
  await page.locator("#importReviewed").check();
  await page.locator("#importApply").click();
  await ready(page);
  await page.reload();
  await ready(page);
  const saved = await page.evaluate("projects.find(p=>p.id==='TR-2026-019')");
  expect(
    saved.actions.filter((a: { id: string }) =>
      result.after.some((updated: { id: string }) => updated.id === a.id),
    ),
  ).toEqual(result.after);
  expect(
    saved.actions.find((a: { id: string }) => a.id === result.custom.id),
  ).toEqual(result.custom);
});

test("reimported completion follows the current spreadsheet's explicit approval and completion evidence", async ({
  page,
}) => {
  const result = await page.evaluate(async () =>
    (window as any).eval(`(async()=>{
    const p=projects.find(project=>project.id==='TR-2026-019');
    const id=p.actions.find(a=>a.tab==='PPAP ID');id.value='PPAP-SAME';id.done='2026-04-01';
    const cr=p.actions.find(a=>a.tab==='CR');cr.value='CR-SAME';cr.status='approved';cr.done='2026-04-01';
    const ppap=p.actions.find(a=>a.tab==='PPAP Status');ppap.value='Full approved';ppap.done='2026-04-01';
    const outcomes=[];
    for(const value of ['Draft','Interim approved','Full approved']){
      const row={'Project ID':p.id,'Part Number':p.pn,[colName(id,p.actions)]:id.value,[colName(id,p.actions)+' — Completed date']:'2026-05-01',[colName(cr,p.actions)]:cr.value,[colName(cr,p.actions)+' — Approval status']:'approved',[colName(cr,p.actions)+' — Completed date']:'',[colName(ppap,p.actions)]:value,[colName(ppap,p.actions)+' — Completed date']:''};
      const plan=await prepareImport([Object.keys(row),Object.values(row)],'confirmed.xlsx','Project');
      const updated=plan.projects.find(project=>project.id===p.id);
      outcomes.push({value,errors:plan.issues.filter(issue=>issue.blocking),id:updated.actions.find(a=>a.id===id.id),cr:updated.actions.find(a=>a.id===cr.id),ppap:updated.actions.find(a=>a.id===ppap.id)});
    }
    const missing={'Project ID':p.id,'Part Number':p.pn,[colName(cr,p.actions)]:'',[colName(cr,p.actions)+' — Approval status']:'approved'};
    const invalid=await prepareImport([Object.keys(missing),Object.values(missing)],'missing-reference.xlsx','Project');
    ppap.value='Draft';ppap.done=null;
    const renewed={'Project ID':p.id,'Part Number':p.pn,[colName(cr,p.actions)]:'CR-REVISED',[colName(cr,p.actions)+' — Approval status']:'approved',[colName(cr,p.actions)+' — Completed date']:'',[colName(ppap,p.actions)]:'Full approved',[colName(ppap,p.actions)+' — Completed date']:''};
    const renewPlan=await prepareImport([Object.keys(renewed),Object.values(renewed)],'new-approval.xlsx','Project');
    const renewedProject=renewPlan.projects.find(project=>project.id===p.id);
    return {outcomes,today:d2s(TODAY),invalidErrors:invalid.issues.filter(issue=>issue.blocking),invalidCr:invalid.projects.find(project=>project.id===p.id).actions.find(a=>a.id===cr.id),renewedErrors:renewPlan.issues.filter(issue=>issue.blocking),renewedCr:renewedProject.actions.find(a=>a.id===cr.id),renewedPpap:renewedProject.actions.find(a=>a.id===ppap.id)};
  })()`),
  );
  for (const outcome of result.outcomes) {
    expect(outcome.errors).toEqual([]);
    expect(outcome.id).toMatchObject({
      value: "PPAP-SAME",
      done: "2026-05-01",
    });
    expect(outcome.cr).toMatchObject({
      value: "CR-SAME",
      status: "approved",
      done: "2026-04-01",
    });
    expect(outcome.ppap).toMatchObject({
      value: outcome.value,
      done: outcome.value === "Full approved" ? "2026-04-01" : null,
    });
  }
  expect(result.invalidErrors.length).toBeGreaterThan(0);
  expect(result.invalidCr.done).toBeNull();
  expect(result.renewedErrors).toEqual([]);
  expect(result.renewedCr).toMatchObject({
    value: "CR-REVISED",
    status: "approved",
    done: result.today,
  });
  expect(result.renewedPpap).toMatchObject({
    value: "Full approved",
    done: result.today,
  });
});

test("editing only the exported current date preserves old history and appends the imported reschedule", async ({
  page,
}) => {
  const result = await page.evaluate(async () =>
    (window as any).eval(`(async()=>{
    const p=projects.find(project=>project.id==='TR-2026-019');
    const a=p.actions.find(action=>action.tab==='FOT Date');
    a.value='2026-04-01';a.orig='2026-04-01';a.done=null;
    a.dateLog=[{ts:'2026-03-01T08:00:00.000Z',by:'Carrie Chen',from:'',to:'2026-04-01',source:'edit'}];
    const row=flatRow(p);
    row[colName(a,p.actions)+' — Current date']='2026-11-01';
    const rows=[Object.keys(row),Object.values(row)];
    const base=contentKey(snapshot());
    const plan=await prepareImport(rows,'rescheduled.xlsx','Project');
    pendingImport={rows,filename:'rescheduled.xlsx',sheet:'Project',fallbackDate:'',base,plan};
    showImportPreview();
    return {errors:plan.issues.filter(issue=>issue.blocking),action:plan.projects.find(project=>project.id===p.id).actions.find(action=>action.id===a.id)};
  })()`),
  );
  expect(result.errors).toEqual([]);
  expect(result.action).toMatchObject({
    orig: "2026-04-01",
    value: "2026-11-01",
    done: null,
    dateLog: [
      {
        ts: "2026-03-01T08:00:00.000Z",
        by: "Carrie Chen",
        from: "",
        to: "2026-04-01",
        source: "edit",
      },
      { from: "2026-04-01", to: "2026-11-01", source: "import" },
    ],
  });
  await page.locator("#importReviewed").check();
  await expect(page.locator("#importApply")).toBeEnabled();
  await page.locator("#importApply").click();
  await ready(page);
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(
      "projects.find(p=>p.id==='TR-2026-019').actions.find(a=>a.tab==='FOT Date')",
    ),
  ).toEqual(result.action);
});

for (const [name, patch] of [
  ["unexpected entry fields", { unexpected: true }],
  ["an impossible February timestamp", { ts: "2026-02-30T08:00:00.000Z" }],
] as const) {
  test(`date-history import blocks ${name} before applying changes`, async ({
    page,
  }) => {
    const before = await page.evaluate("JSON.parse(contentKey(snapshot()))");
    const errors = await page.evaluate(
      async (patch) =>
        (window as any).eval(`(async()=>{
      const p=projects.find(project=>project.id==='TR-2026-019');
      const a=p.actions.find(action=>action.tab==='FOT Date');
      const row=flatRow(p);
      row['Project ID']='TR-2026-999';
      row[colName(a,p.actions)+' — Original date']='2026-04-01';
      row[colName(a,p.actions)+' — Current date']='2026-04-01';
      row[colName(a,p.actions)+' — Date history']=JSON.stringify([
        {ts:'2026-03-01T08:00:00.000Z',by:'Carrie Chen',from:'',to:'2026-04-01',source:'edit',...${JSON.stringify(patch)}}
      ]);
      const rows=[Object.keys(row),Object.values(row)];
      const base=contentKey(snapshot());
      const plan=await prepareImport(rows,'invalid-history.xlsx','Project');
      pendingImport={rows,filename:'invalid-history.xlsx',sheet:'Project',fallbackDate:'',base,plan};
      showImportPreview();
      return plan.issues.filter(issue=>issue.blocking);
    })()`),
      patch,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocking: true,
          message: "FOT Date: Invalid date history.",
        }),
      ]),
    );
    await page.locator("#importReviewed").check();
    await expect(page.locator("#importApply")).toBeDisabled();
    expect(await page.evaluate("JSON.parse(contentKey(snapshot()))")).toEqual(
      before,
    );
  });
}

test("invalid workspace file leaves memory and server unchanged", async ({
  page,
}) => {
  const before = await page.evaluate("JSON.parse(contentKey(snapshot()))");
  await page.evaluate(
    "loadWorkspaceFile(new File([JSON.stringify({v:1,projects:[]})], 'broken.json', {type:'application/json'}))",
  );
  await expect(page.locator("#toast")).toContainText("Invalid workspace file");
  expect(await page.evaluate("JSON.parse(contentKey(snapshot()))")).toEqual(
    before,
  );
  await page.reload();
  await ready(page);
  expect(await page.evaluate("JSON.parse(contentKey(snapshot()))")).toEqual(
    before,
  );
});

test("custom team labels are displayed as text without executing markup", async ({
  page,
}) => {
  await page.evaluate(
    `TEAM_ROWS[0][1]='<img src=x onerror="window.injected=true">';openProject('TR-2026-019')`,
  );
  await expect(page.locator("#main .team")).toContainText("<img src=x");
  expect(await page.evaluate("window.injected")).toBeUndefined();
  await expect(page.locator("#main .team img")).toHaveCount(0);
});

test("BPW, CVS CR and OEM - Tech columns map to actions and master data (2026-09-23 decision)", async ({
  page,
}) => {
  const result = await page.evaluate(async () =>
    (window as any).eval(`(async()=>{
    const labeled=projects.find(project=>project.id==='TR-2026-019');
    const unlabeled=projects.find(project=>project.id==='TR-2026-014');
    const cvsApplicableBefore=unlabeled.actions.find(a=>a.tab==='CVS CR'&&a.act==='Identify if applicable or not').value;
    const headers=['Project ID','Part Number','Description','BPW','CVS CR','OEM - Tech','CR'];
    const rows=[
      headers,
      [labeled.id,labeled.pn,'Labeled split','BPW-26-34300066 Ford\\nBPW-25-34300392  STLA\\nBPW-26-34300153 Core','CR0625915','Buckles 3F','CR0619296'],
      [unlabeled.id,unlabeled.pn,'Unlabeled default','BPW-25-4110130','TBD','SPR4','CR0604745'],
    ];
    const base=contentKey(snapshot());
    const plan=await prepareImport(rows,'bpw-mapping.xlsx','Project');
    const pick=(p,tab,act)=>plan.projects.find(project=>project.id===p.id).actions.find(a=>a.tab===tab&&a.act===act);
    return {
      errors:plan.issues.filter(issue=>issue.blocking),
      labeled:{
        tech:plan.projects.find(project=>project.id===labeled.id).tech,
        core:{value:pick(labeled,'Core BPW','Input BPW number').value,status:pick(labeled,'Core BPW','Input BPW number').status,done:pick(labeled,'Core BPW','Input BPW number').done},
        oem:{value:pick(labeled,'OEM BPW','Identify BPW number').value},
        cvs:{value:pick(labeled,'CVS CR','Input CR number for CVS on Windchill').value,status:pick(labeled,'CVS CR','Input CR number for CVS on Windchill').status},
        cvsApplicable:{before:cvsApplicableBefore,after:pick(unlabeled,'CVS CR','Identify if applicable or not').value},
        cr:{status:pick(labeled,'CR','Input CR number').status},
        warnings:plan.projects.find(project=>project.id===labeled.id).importWarnings,
      },
      unlabeled:{
        tech:plan.projects.find(project=>project.id===unlabeled.id).tech,
        core:{value:pick(unlabeled,'Core BPW','Input BPW number').value,status:pick(unlabeled,'Core BPW','Input BPW number').status},
        warnings:plan.projects.find(project=>project.id===unlabeled.id).importWarnings,
      },
      ambiguous:plan.projects.flatMap(project=>(project.importWarnings||[]).filter(w=>w.includes('Unmapped / ambiguous'))),
    };
  })()`),
  );
  expect(result.errors).toEqual([]);
  expect(result.labeled.tech).toBe("Buckles 3F");
  expect(result.labeled.core).toEqual({
    value: "BPW-26-34300153 Core",
    status: "initiated",
    done: null,
  });
  expect(result.labeled.oem.value).toBe(
    "BPW-26-34300066 Ford\nBPW-25-34300392  STLA",
  );
  expect(result.labeled.cvs).toEqual({
    value: "CR0625915",
    status: "initiated",
  });
  expect(result.labeled.cvsApplicable.after).toBe(
    result.labeled.cvsApplicable.before,
  );
  expect(result.labeled.cr.status).toBe("initiated");
  expect(result.labeled.warnings.join("\n")).not.toContain("assumed Core");
  expect(result.unlabeled.tech).toBe("SPR4");
  expect(result.unlabeled.core).toEqual({
    value: "BPW-25-4110130",
    status: "initiated",
  });
  expect(result.unlabeled.warnings.join("\n")).toContain(
    "BPW: 1 number without a Core/OEM label — assumed Core",
  );
  expect(result.unlabeled.warnings.join("\n")).toContain(
    "CVS CR: Unresolved value retained: TBD",
  );
  expect(result.ambiguous).toEqual([]);

  const applied = await page.evaluate(async () =>
    (window as any).eval(`(async()=>{
    const headers=['Project ID','Part Number','Description','BPW','CVS CR','OEM - Tech','CR'];
    const p=projects.find(project=>project.id==='TR-2026-019');
    const rows=[headers,[p.id,p.pn,'Labeled split','BPW-26-34300066 Ford\\nBPW-25-34300392  STLA\\nBPW-26-34300153 Core','CR0625915','Buckles 3F','CR0619296']];
    const base=contentKey(snapshot());
    const plan=await prepareImport(rows,'bpw-mapping.xlsx','Project');
    pendingImport={rows,filename:'bpw-mapping.xlsx',sheet:'Project',fallbackDate:'',base,plan};showImportPreview();
    return plan.issues.filter(issue=>issue.blocking).length;
  })()`),
  );
  expect(applied).toBe(0);
  await page.locator("#importReviewed").check();
  await page.locator("#importApply").click();
  await ready(page);
  await page.reload();
  await ready(page);
  const saved = await page.evaluate("projects.find(p=>p.id==='TR-2026-019')");
  expect(saved.tech).toBe("Buckles 3F");
  expect(
    saved.actions.find(
      (a: { tab: string; act: string }) =>
        a.tab === "Core BPW" && a.act === "Input BPW number",
    ),
  ).toMatchObject({ value: "BPW-26-34300153 Core", status: "initiated" });
  expect(
    saved.actions.find(
      (a: { tab: string; act: string }) =>
        a.tab === "OEM BPW" && a.act === "Identify BPW number",
    ).value,
  ).toBe("BPW-26-34300066 Ford\nBPW-25-34300392  STLA");
});

test("resetting to demo data warns about non-demo projects and downloads a backup first", async ({
  page,
}) => {
  const demoOnly = await page.evaluate(() => {
    const confirmMessages: string[] = [];
    let backupCalls = 0;
    window.confirm = (message: string) => {
      confirmMessages.push(message);
      return false;
    };
    (window as any).saveWorkspaceFile = () => {
      backupCalls++;
    };
    resetDemo();
    return { confirmMessages, backupCalls, projectCount: projects.length };
  });
  expect(demoOnly.projectCount).toBe(6);
  expect(demoOnly.backupCalls).toBe(0);
  expect(demoOnly.confirmMessages[0]).not.toContain("not part of the demo");

  const withExtra = await page.evaluate(() => {
    const confirmMessages: string[] = [];
    let backupCalls = 0;
    window.confirm = (message: string) => {
      confirmMessages.push(message);
      return true;
    };
    (window as any).saveWorkspaceFile = () => {
      backupCalls++;
    };
    projects.push({ ...structuredClone(projects[0]), id: "IMP-E2E-1" });
    resetDemo();
    return { confirmMessages, backupCalls, projectCount: projects.length };
  });
  expect(withExtra.confirmMessages[0]).toContain("not part of the demo");
  expect(withExtra.confirmMessages[0]).toContain("including imported data");
  expect(withExtra.backupCalls).toBe(1);
  expect(withExtra.projectCount).toBe(6);
});

// 真实日期单元格：SheetJS 读出的 Date 对象必须表示表格里显示的日历日期，
// 与浏览器时区无关（东八区曾把 2026-09-23 记成 2026-09-22）。
for (const timezoneId of ["Asia/Taipei", "America/Los_Angeles"]) {
  test.describe(`Excel date cells in ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("real date cells import as the calendar date shown in the sheet", async ({
      page,
    }) => {
      const result = await page.evaluate(async () =>
        (window as any).eval(`(async()=>{
        const sheet=XLSX.utils.aoa_to_sheet([
          ['Part Number','Description','Created','FOT Date','SOP'],
          ['DATE-CELL','Date cell test',new Date(2026,8,18),new Date(2026,8,23),new Date(2026,11,1)],
        ],{cellDates:true});
        const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'Project');
        const file=new File([XLSX.write(workbook,{type:'array',bookType:'xlsx'})],'dates.xlsx');
        await importExcel(file);
        const project=pendingImport.plan.projects.find(p=>p.pn==='DATE-CELL');
        const value=tab=>project.actions.find(a=>a.tab===tab).value;
        return {
          blocking:pendingImport.plan.issues.filter(i=>i.blocking),
          created:d2s(project.created),
          fot:value('FOT Date'),
          sop:value('SOP'),
          raw:project.importSource.values.slice(2),
        };
      })()`),
      );
      expect(result.blocking).toEqual([]);
      expect(result.created).toBe("2026-09-18");
      expect(result.fot).toBe("2026-09-23");
      expect(result.sop).toBe("2026-12-01");
      expect(result.raw).toEqual(["2026-09-18", "2026-09-23", "2026-12-01"]);
    });
  });
}
