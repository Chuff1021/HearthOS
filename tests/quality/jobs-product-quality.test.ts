import assert from "node:assert/strict";
import test from "node:test";
import { customerAddress, jobTypeOptions, localDateValue, scheduledDateLabel, scheduledTimeLabel, fetchJobArray, resolveJobType } from "../../src/components/job-form/job-form-helpers";
import { json, pageHarness } from "./jobs-offline-harness";

const job = (id = "job-1") => ({ id, jobNumber: `J-${id}`, title: `Fireplace ${id}`, customerId: "customer-1", customerName: "Test Customer", propertyAddress: "10 Main St Suite 2", jobType: "wood-service", status: "scheduled", priority: "normal", scheduledDate: localDateValue(), scheduledTimeStart: "09:00", scheduledTimeEnd: "10:00", assignedTechs: [], totalAmount: 0 });
const defaults = (url: string) => {
  if (url.includes("/api/techs")) return json({ techs: [] });
  if (url.includes("/api/time-off-requests")) return json({ requests: [] });
  if (url.includes("/api/customer-lookup")) return json({ customers: [] });
  if (url.includes("/api/jobs/context")) return json({ related: { localInvoices: [], quickbooksInvoices: [], quickbooksEstimates: [] } });
  if (url.includes("/api/jobs")) return json({ jobs: [job()] });
  throw new Error(`Unexpected request: ${url}`);
};
const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
};

test("local dates retain calendar day across UTC rollover and DST", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/Chicago";
    assert.equal(localDateValue(new Date("2026-09-10T02:30:00Z")), "2026-09-09");
    assert.equal(localDateValue(new Date("2026-03-08T07:30:00Z")), "2026-03-08");
    assert.match(scheduledDateLabel("2026-09-09"), /Sep 9, 2026/);
    process.env.TZ = "Pacific/Auckland";
    assert.equal(localDateValue(new Date("2026-09-09T13:30:00Z")), "2026-09-10");
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  assert.equal(scheduledTimeLabel("00:00"), "12:00 AM");
  assert.equal(scheduledTimeLabel("13:15:00"), "1:15 PM");
  assert.equal(scheduledTimeLabel(""), "No time set");
});

test("shared types and addresses preserve existing string values and line 2", () => {
  const options = jobTypeOptions(["wood-service", "Custom legacy & value", "Custom legacy & value"]);
  for (const value of ["service", "wood-service", "pellet-service", "follow-up", "custom", "Custom legacy & value"]) assert.equal(options.filter((option) => option.value === value).length, 1);
  assert.equal(customerAddress({ line1: "10 Main", line2: "Suite 2", city: "Madison", state: "WI", zip: "53703" }), "10 Main Suite 2 Madison, WI 53703");
  assert.equal(customerAddress({ line2: "Unit B" }), "Unit B");
  assert.equal(resolveJobType("custom", "  Masonry touch-up  "), "Masonry touch-up");
  assert.equal(resolveJobType("Legacy Original", "ignored"), "Legacy Original");
  assert.throws(() => resolveJobType("custom", "  "), /Enter a custom job type/);
  assert.throws(() => resolveJobType("custom", "x".repeat(121)), /120 characters/);
});

test("array loader rejects HTTP and malformed bodies rather than fabricating empty data", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => json({ error: "Unavailable" }, 503);
    await assert.rejects(fetchJobArray("/offline", "jobs"), /HTTP 503/);
    globalThis.fetch = async () => json({});
    await assert.rejects(fetchJobArray("/offline", "jobs"), /invalid response/);
  } finally { globalThis.fetch = previous; }
});

test("jobs distinguish initial failure, empty success, and stale refresh data", async () => {
  let mode = "fail";
  const h = await pageHarness("jobs", "", (url) => url.includes("limit=1000") ? mode === "fail" ? json({}, 503) : json({ jobs: mode === "empty" ? [] : [job()] }) : defaults(url));
  try {
    await h.settle();
    assert.match(h.text(), /HTTP 503/);
    assert.doesNotMatch(h.text(), /No jobs yet/);
    mode = "empty"; await h.click("Retry");
    assert.match(h.text(), /No jobs yet/);
    mode = "success"; await h.click("Refresh jobs");
    assert.match(h.text(), /9:00 AM/);
    assert.match(h.text(), /10:00 AM/);
    assert.match(h.text(), new RegExp(new Date().getFullYear().toString()));
    mode = "fail"; await h.click("Refresh jobs");
    assert.match(h.text(), /Showing previously loaded jobs/);
    assert.match(h.text(), /Fireplace job-1/);
  } finally { h.unmount(); }
});

test("jobs ?id opens the exact completed record outside the list and survives list refresh", async () => {
  const exact = { ...job("exact & id"), status: "completed" };
  const h = await pageHarness("jobs", "id=exact%20%26%20id", (url) => url === "/api/jobs?id=exact%20%26%20id" ? json({ jobs: [job("wrong"), exact] }) : defaults(url));
  try {
    await h.settle();
    assert.match(h.text(), /Fireplace exact & id/);
    assert.doesNotMatch(h.text(), /Fireplace wrong/);
    await h.click("Refresh jobs");
    assert.match(h.text(), /Fireplace exact & id/);
    await h.click("Close");
    assert.doesNotMatch(h.text(), /Fireplace exact & id/);
  } finally { h.unmount(); }
});

test("jobs reject near-match IDs with an explicit unavailable state", async () => {
  const h = await pageHarness("jobs", "id=missing", (url) => url === "/api/jobs?id=missing" ? json({ jobs: [job("missing-other")] }) : defaults(url));
  try { await h.settle(); assert.match(h.text(), /not found or is no longer available/); assert.doesNotMatch(h.text(), /Fireplace missing-other/); }
  finally { h.unmount(); }
});

test("late related-context responses cannot replace a newer selected job", async () => {
  const oldContext = deferred();
  const h = await pageHarness("jobs", "id=old", (url) => {
    if (url === "/api/jobs/context?id=old") return oldContext.promise;
    if (url === "/api/jobs?id=old") return json({ jobs: [job("old")] });
    if (url === "/api/jobs?id=new") return json({ jobs: [job("new")] });
    return defaults(url);
  });
  try {
    await h.settle(); h.navigate("id=new"); await h.settle();
    oldContext.resolve(json({ related: { localInvoices: [{ id: "wrong-doc", invoiceNumber: "WRONG", totalAmount: 1 }], quickbooksInvoices: [], quickbooksEstimates: [] } }));
    await h.settle();
    assert.match(h.text(), /Fireplace new/);
    assert.doesNotMatch(h.text(), /WRONG/);
    assert.equal(h.calls.some((call) => call.url.includes("wrong-doc")), false);
  } finally { h.unmount(); }
});

test("schedule blocks job save during customer review and reconciles the retained payload after reopening with an empty draft", async () => {
  const h = await pageHarness("schedule", "create=1&title=Keep%20title&address=Keep%20address", (url, init) => {
    if (init.method === "POST") {
      assert.equal(url, "/api/quickbooks/customers");
      const payload = JSON.parse(String(init.body));
      return payload.action === "reconcile"
        ? json({ success: true, customer: { id: "123", displayName: "New Test Customer", address: { line1: "Keep address" } } })
        : json({}, 503);
    }
    return defaults(url);
  });
  try {
    await h.settle(); await h.change("input", "Customer", "New Test Customer");
    await new Promise(resolve => setTimeout(resolve, 280)); await h.settle();
    await h.click("Create Customer");
    const initial = JSON.parse(String(h.calls.find(call => call.init.method === "POST")!.init.body));
    assert.equal(h.find("button", "Create Job").props.disabled, true);
    await h.click("Create Job");
    assert.equal(h.calls.some(call => call.url === "/api/jobs" && call.init.method === "POST"), false);
    // Recovery must use the immutable request, not mutable or reset form fields.
    await h.change("input", "Customer", "");
    await h.click("Close new job"); await h.click("New Job");
    await h.click("Check creation status");
    const recovery = h.calls.filter(call => call.init.method === "POST").at(-1)!;
    assert.deepEqual(JSON.parse(String(recovery.init.body)), { ...initial, action: "reconcile" });
    assert.doesNotMatch(h.text(), /creation needs review/);
    assert.equal(h.find("button", "Create Job").props.disabled, false);
  } finally { h.unmount(); }
});

test("schedule job submission is synchronously single-flight", async () => {
  const pending = deferred();
  const h = await pageHarness("schedule", "create=1&customerId=c1&customerName=Test&address=10%20Main&title=Test%20visit", (url, init) => init.method === "POST" ? pending.promise : defaults(url));
  try {
    await h.settle();
    const submit = h.find("button", "Create Job").props.onClick;
    const first = submit();
    await submit();
    assert.equal(h.calls.filter(call => call.init.method === "POST").length, 1);
    pending.resolve(json({}, 503)); await first; await h.settle();
    assert.equal(h.find("button", "Create Job").props.disabled, false);
  } finally { h.unmount(); }
});

for (const page of ["jobs", "schedule"] as const) {
  test(`${page} create retains customer prefill, legacy type, and form on HTTP failure`, async () => {
    const h = await pageHarness(page, "create=1&customerId=c1&customerName=Test&address=10%20Main%20Suite%202&title=Prefilled&jobType=legacy-type", (url, init) => init.method === "POST" ? json({}, 503) : defaults(url));
    try {
      await h.settle();
      assert.equal(h.find("input", "Property address").props.value, "10 Main Suite 2");
      assert.equal(h.find("select", "Job type").props.value, "legacy-type");
      for (const value of ["follow-up", "custom", "legacy-type"]) assert.ok(h.nodes().some((node) => node.type === "option" && node.props.value === value));
      await h.change("select", "Job type", "follow-up");
      await h.click("Create Job");
      const sent = JSON.parse(h.calls.find((call) => call.init.method === "POST")!.init.body as string);
      assert.equal(sent.jobType, "follow-up"); assert.equal(sent.propertyAddress, "10 Main Suite 2"); assert.equal(sent.customerId, "c1");
      assert.equal(h.find("input", "Job title").props.value, "Prefilled");
      assert.match(h.text(), /Could not create job|Failed to add job/);
    } finally { h.unmount(); }
  });
}

test("schedule failed delete keeps details and schedule; successful delete removes only after confirmation", async () => {
  let fail = true;
  let deleted = false;
  const h = await pageHarness("schedule", "", (url, init) => {
    if (init.method === "DELETE") { if (!fail) deleted = true; return json({}, fail ? 503 : 200); }
    if (url.includes("limit=1000")) return json({ jobs: deleted ? [] : [job()] });
    return defaults(url);
  });
  try {
    await h.settle();
    const open = h.nodes().find((node) => node.type === "button" && node.props["aria-label"]?.startsWith("Open Fireplace"))!;
    assert.ok(open, "job has a keyboard-accessible open control");
    open.props.onClick(); await h.settle();
    await h.click("Remove");
    assert.match(h.text(), /HTTP 503/);
    assert.ok(h.find("button", "Close job details"));
    assert.match(h.text(), /Fireplace job-1/);
    fail = false; await h.click("Remove");
    assert.equal(h.nodes().some((node) => node.props["aria-label"] === "Close job details"), false);
    assert.doesNotMatch(h.text(), /Fireplace job-1/);
  } finally { h.unmount(); }
});

for (const outcome of ["network", "503", "malformed-success", "401"]) {
  test(`schedule customer creation ${outcome} never falls back or automatically retries`, async () => {
    const h = await pageHarness("schedule", "create=1&title=Keep%20title&address=Keep%20address", (url, init) => {
      if (init.method === "POST") {
        assert.equal(url, "/api/quickbooks/customers");
        if (outcome === "network") throw new Error("Offline");
        if (outcome === "malformed-success") return json({ customer: {} });
        return json({}, Number(outcome));
      }
      return defaults(url);
    });
    try {
      await h.settle(); await h.change("input", "Customer", "New Test Customer");
      await new Promise((resolve) => setTimeout(resolve, 280)); await h.settle();
      await h.click("Create Customer");
      assert.equal(h.calls.filter((call) => call.init.method === "POST").length, 1);
      assert.equal(h.calls.some((call) => call.url === "/api/customers"), false);
      assert.equal(h.find("input", "Job title").props.value, "Keep title");
      assert.equal(h.find("input", "Property address").props.value, "Keep address");
      if (outcome !== "401") {
        assert.match(h.text(), /creation needs review/);
        await h.change("input", "Customer", "Another search");
        assert.match(h.text(), /creation needs review/);
        assert.equal(h.find("button", "Create Customer").props.disabled, true);
        const initial = JSON.parse(String(h.calls.find(call => call.init.method === "POST")!.init.body));
        await h.click("Check creation status");
        const recovery = h.calls.filter(call => call.init.method === "POST").at(-1)!;
        assert.deepEqual(JSON.parse(String(recovery.init.body)), { ...initial, action: "reconcile" });
      } else assert.match(h.text(), /rejected \(HTTP 401\)/);
    } finally { h.unmount(); }
  });
}

for (const page of ["jobs", "schedule"] as const) {
  test(`${page} custom job type requires text and sends trimmed text in the existing payload`, async () => {
    const h = await pageHarness(page, "create=1&customerId=c1&customerName=Test&address=10%20Main&title=Custom%20visit", (url, init) => init.method === "POST" ? json({}, 503) : defaults(url));
    try {
      await h.settle();
      await h.change("select", "Job type", "custom");
      await h.click("Create Job");
      assert.equal(h.calls.filter((call) => call.init.method === "POST").length, 0);
      assert.match(h.text(), /Enter a custom job type/);
      assert.equal(h.find("input", "Custom job type").props.maxLength, 120);
      await h.change("input", "Custom job type", "  Masonry touch-up  ");
      await h.click("Create Job");
      const sent = JSON.parse(h.calls.find((call) => call.init.method === "POST")!.init.body as string);
      assert.equal(sent.jobType, "Masonry touch-up");
      assert.equal("customJobType" in sent, false);
      assert.equal(h.find("input", "Custom job type").props.value, "  Masonry touch-up  ");
    } finally { h.unmount(); }
  });
}

test("editing preserves unknown legacy types and inactive assigned technicians", async () => {
  const existing = { ...job("legacy"), jobType: "Original legacy type", assignedTechs: [{ id: "inactive", name: "Original Technician", color: "#123456" }] };
  const h = await pageHarness("jobs", "id=legacy", (url, init) => {
    if (init.method === "PUT") return json({}, 503);
    if (url === "/api/jobs?id=legacy") return json({ jobs: [existing] });
    return defaults(url);
  });
  try {
    await h.settle(); await h.click("Edit");
    assert.equal(h.find("select", "Job type").props.value, "Original legacy type");
    await h.click("Save");
    const sent = JSON.parse(h.calls.find((call) => call.init.method === "PUT")!.init.body as string);
    assert.equal(sent.jobType, "Original legacy type");
    assert.deepEqual(sent.assignedTechs, existing.assignedTechs);
  } finally { h.unmount(); }
});

test("a delayed initial list cannot reset an active deep-linked edit draft", async () => {
  const initialList = deferred();
  const original = { ...job("target"), title: "Original title", notes: "Original notes" };
  const h = await pageHarness("jobs", "id=target", (url, init) => {
    if (init.method === "PUT") return json({}, 503);
    if (url.includes("limit=1000")) return initialList.promise;
    if (url === "/api/jobs?id=target") return json({ jobs: [original] });
    if (url.includes("/api/techs")) return json({ techs: [{ id: "new-tech", name: "New Technician", color: "#123456" }] });
    return defaults(url);
  });
  try {
    await h.settle(); await h.click("Edit");
    await h.change("input", "Job title", "Edited title");
    await h.change("input", "Property address", "Edited address Suite 9");
    await h.change("textarea", "Notes", "Unsaved notes");
    await h.change("select", "Job type", "custom");
    await h.change("input", "Custom job type", "Masonry touch-up");
    await h.change("input", "Scheduled date", "2026-12-12");
    const checkbox = h.nodes().find((node) => node.type === "input" && node.props.type === "checkbox")!;
    checkbox.props.onChange({ target: { checked: true } }); await h.settle();
    initialList.resolve(json({ jobs: [original] })); await h.settle();
    assert.equal(h.find("input", "Job title").props.value, "Edited title");
    assert.equal(h.find("textarea", "Notes").props.value, "Unsaved notes");
    assert.equal(h.find("input", "Custom job type").props.value, "Masonry touch-up");
    assert.equal(h.find("input", "Scheduled date").props.value, "2026-12-12");
    await h.click("Save");
    const sent = JSON.parse(h.calls.find((call) => call.init.method === "PUT")!.init.body as string);
    assert.equal(sent.title, "Edited title");
    assert.equal(sent.propertyAddress, "Edited address Suite 9");
    assert.equal(sent.jobType, "Masonry touch-up");
    assert.equal(sent.assignedTechs[0].id, "new-tech");
    assert.equal(h.find("input", "Job title").props.value, "Edited title", "failed saves retain the draft too");
    await h.click("Cancel"); await h.click("Edit");
    assert.equal(h.find("input", "Job title").props.value, "Original title", "Cancel discards the draft");
  } finally { h.unmount(); }
});

for (const refreshFails of [false, true]) {
  test(`saving a job outside the capped list applies the returned record when refresh ${refreshFails ? "fails" : "omits it"}`, async () => {
    const original = { ...job("beyond-cap"), title: "Original title" };
    const saved = { ...original, title: "Edited title (server)", propertyAddress: "Saved address Suite 3", jobType: "Masonry touch-up", notes: "Saved notes" };
    let putCompleted = false;
    const h = await pageHarness("jobs", "id=beyond-cap", (url, init) => {
      if (init.method === "PUT") { putCompleted = true; return json({ job: saved }); }
      if (url.includes("limit=1000")) return putCompleted && refreshFails ? json({}, 503) : json({ jobs: [job("other")] });
      if (url === "/api/jobs?id=beyond-cap") return json({ jobs: [original] });
      return defaults(url);
    });
    try {
      await h.settle(); await h.click("Edit");
      await h.change("input", "Job title", "Edited title"); await h.click("Save");
      assert.ok(h.find("h2", saved.title), "details use the server-authoritative job, not the capped list");
      assert.match(h.text(), /Saved address Suite 3/);
      if (refreshFails) assert.match(h.text(), /HTTP 503/);
      await h.click("Edit");
      assert.equal(h.find("input", "Job title").props.value, saved.title);
      assert.equal(h.find("select", "Job type").props.value, saved.jobType);
      assert.equal(h.find("textarea", "Notes").props.value, saved.notes);
    } finally { h.unmount(); }
  });
}

test("a save completing after selection changes cannot overwrite or close another job's draft", async () => {
  const put = deferred();
  const first = job("first"); const second = job("second");
  const h = await pageHarness("jobs", "id=first", (url, init) => {
    if (init.method === "PUT") return put.promise;
    if (url.includes("limit=1000")) return json({ jobs: [first, second] });
    if (url === "/api/jobs?id=first") return json({ jobs: [first] });
    if (url === "/api/jobs?id=second") return json({ jobs: [second] });
    return defaults(url);
  });
  try {
    await h.settle(); await h.click("Edit");
    await h.change("input", "Job title", "Saved first job");
    const saving = h.click("Save"); await h.settle();
    h.navigate("id=second"); await h.settle(); await h.click("Edit");
    await h.change("input", "Job title", "Unsaved second job");
    put.resolve(json({ job: { ...first, title: "Saved first job" } })); await saving;
    assert.equal(h.find("input", "Job title").props.value, "Unsaved second job");
    assert.ok(h.find("h2", second.title));
  } finally { h.unmount(); }
});

test("mobile agenda sorts jobs and keeps data visible on refresh failure", async () => {
  let fail = false;
  const earlier = { ...job("early"), scheduledTimeStart: "08:00" };
  const later = { ...job("late"), scheduledTimeStart: "14:00", scheduledTimeEnd: "15:00" };
  const h = await pageHarness("schedule", "", (url) => url.includes("limit=1000") ? fail ? json({}, 503) : json({ jobs: [later, earlier] }) : defaults(url));
  try {
    await h.settle();
    const agenda = h.find("section", "Schedule agenda");
    assert.match(agenda.props.className, /lg:hidden/);
    assert.ok(h.text(agenda).indexOf("Fireplace early") < h.text(agenda).indexOf("Fireplace late"));
    fail = true; await h.click("Refresh schedule");
    assert.match(h.text(), /Showing previously loaded data/);
    assert.match(h.text(h.find("section", "Schedule agenda")), /Fireplace early/);
    assert.doesNotMatch(h.text(h.find("section", "Schedule agenda")), /No jobs scheduled/);
  } finally { h.unmount(); }
});

test("mobile agenda empty success is distinct from initial load failure", async () => {
  let fail = true;
  const h = await pageHarness("schedule", "", (url) => url.includes("limit=1000") ? fail ? json({}, 503) : json({ jobs: [] }) : defaults(url));
  try {
    await h.settle();
    assert.match(h.text(), /Schedule unavailable/);
    assert.doesNotMatch(h.text(), /No jobs scheduled/);
    fail = false; await h.click("Retry jobs");
    assert.match(h.text(h.find("section", "Schedule agenda")), /No jobs scheduled/);
  } finally { h.unmount(); }
});

test("mobile agenda starts at the top after loading and date/view changes, including desktop resize", async () => {
  const jobs = deferred();
  const fixedDate = new Proxy(Date, {
    construct(target, args) { return Reflect.construct(target, args.length ? args : ["2026-09-09T15:00:00"]); },
  });
  const h = await pageHarness("schedule", "", (url) => url.includes("limit=1000") ? jobs.promise : defaults(url), { viewportWidth: 390, date: fixedDate, initialScrollTop: 720 });
  try {
    assert.equal(h.scrollContainer.scrollTop, 0, "mobile loading must not retain a desktop hour offset");
    jobs.resolve(json({ jobs: [{ ...job(), scheduledDate: "2026-09-09" }] }));
    await h.settle();
    assert.equal(h.scrollContainer.scrollTop, 0, "loaded agenda must remain visible");
    assert.match(h.text(h.find("section", "Schedule agenda")), /Fireplace job-1/);
    h.scrollContainer.scrollTop = 600;
    await h.click("Next week");
    assert.equal(h.scrollContainer.scrollTop, 0, "date navigation must reveal the new agenda");
    h.scrollContainer.scrollTop = 600;
    await h.click("Month");
    assert.equal(h.scrollContainer.scrollTop, 0, "view navigation must reveal the agenda");
    await h.click("Week");
    h.setViewport(1440);
    assert.equal(h.scrollContainer.scrollTop, 720, "desktop week grid retains current-hour scrolling");
    h.setViewport(390);
    assert.equal(h.scrollContainer.scrollTop, 0, "switching to mobile clears the desktop offset");
    assert.equal(h.mediaListenerCount(), 1, "navigation must clean up superseded listeners");
  } finally { h.unmount(); }
  assert.equal(h.mediaListenerCount(), 0, "unmount cleans up breakpoint listeners");
});
