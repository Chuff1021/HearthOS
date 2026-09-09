import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assignmentCoverage, fetchDashboardData, parseDashboardPayload, QUICK_ADD_JOB_HREF } from "../../src/components/dashboard/dashboard-data";

test("Quick Add points to the existing jobs create flow", () => {
  assert.equal(QUICK_ADD_JOB_HREF, "/jobs?create=1");
  const jobsPage = readFileSync(new URL("../../src/app/jobs/page.tsx", import.meta.url), "utf8");
  assert.match(jobsPage, /searchParams\.get\("create"\) === "1"/);
});

test("assignment coverage is unavailable for absent or empty jobs, with no confidence floor", () => {
  assert.equal(assignmentCoverage(null), null);
  assert.equal(assignmentCoverage([]), null);
  assert.equal(assignmentCoverage([{ assignedTechs: [] }]), 0);
  assert.equal(assignmentCoverage([{ assignedTechs: [] }, { assignedTechs: [{ id: "t" }] }]), 50);
  assert.equal(assignmentCoverage([{ assignedTechs: [{ id: "t" }] }]), 100);
});

test("missing or malformed payloads are errors, never empty data or zeros", () => {
  for (const source of ["profit", "customers", "vendors", "dispatch", "jobs", "activity"] as const) {
    for (const payload of [null, {}, { error: "offline" }]) {
      assert.throws(() => parseDashboardPayload(source, payload));
    }
  }
  assert.throws(() => parseDashboardPayload("profit", { windowStats: { revenue: NaN } }));
  assert.throws(() => parseDashboardPayload("jobs", { jobs: [{ id: "j", assignedTechs: null }] }));
  assert.throws(() => parseDashboardPayload("customers", { items: [], moneyBar: { totalDue: 0 } }));
  assert.throws(() => parseDashboardPayload("vendors", { moneyBar: { totalOwed: "0", openBillCount: 0, overdueCount: 0, openPOValue: 0 } }));
});

test("valid empty responses stay distinct from failures; truncated schedules are not complete", () => {
  assert.deepEqual(parseDashboardPayload("jobs", { jobs: [], total: 0 }), []);
  assert.deepEqual(parseDashboardPayload("jobs", []), []);
  assert.deepEqual(parseDashboardPayload("activity", { activity: [] }), []);
  assert.throws(() => parseDashboardPayload("jobs", { jobs: [], total: 1 }));
  const profit = { windowStats: { revenue: 0, profit: 0, invoiceCount: 0, margin: null, cogs: 0, billable: 0 } };
  assert.deepEqual(parseDashboardPayload("profit", profit), profit);
});

test("request failure is isolated from successful sources and request uses abort/no-store", async () => {
  const controller = new AbortController();
  const request: typeof fetch = async (url, options) => {
    assert.equal(options?.signal, controller.signal);
    assert.equal(options?.cache, "no-store");
    if (url === "/broken") throw new Error("offline");
    return Response.json({ jobs: [], total: 0 });
  };
  const results = await Promise.allSettled([
    fetchDashboardData("jobs", "/broken", controller.signal, request),
    fetchDashboardData("jobs", "/success", controller.signal, request),
  ]);
  assert.equal(results[0].status, "rejected");
  assert.deepEqual(results[1], { status: "fulfilled", value: [] });
});

test("HTTP and JSON errors reject without exposing provider details", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(fetchDashboardData("jobs", "/offline", signal, async () => new Response("private details", { status: 503 })), /Source unavailable/);
  await assert.rejects(fetchDashboardData("jobs", "/invalid-json", signal, async () => new Response("not json")));
});
