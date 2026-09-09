import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import {
  createHeaderSearch, parseSearchResults, parseDispatchStatus, parseQuickBooksStatus, readHeaderJson,
  type HeaderSearchState,
} from "../../src/components/layout/header-search";
import { getDisplayIdentity } from "../../src/components/layout/header-identity";

const customerId = "11111111-1111-4111-8111-111111111111";
function payload(title = "Example Customer") {
  return { customers: [{ id: customerId, type: "customer", title, subtitle: "100 Example Street", href: `/customers/${customerId}`, source: "local" }], jobs: [], invoices: [] };
}
function harness(timeout = 1000) {
  const states: HeaderSearchState[] = [];
  const pending: { resolve: (value: Response) => void; reject: (reason: unknown) => void; signal: AbortSignal }[] = [];
  const fetcher = ((_url, options) => new Promise<Response>((resolve, reject) => {
    pending.push({ resolve, reject, signal: options!.signal as AbortSignal });
  })) as typeof fetch;
  const controller = createHeaderSearch((state) => states.push(state), fetcher, 0, timeout);
  return { states, pending, controller, latest: () => states.at(-1)! };
}

test("header validates the actual customer profile and query-ID job/invoice contracts", () => {
  const value = payload();
  assert.equal(parseSearchResults(value).customers[0].href, `/customers/${customerId}`);
  assert.equal(parseSearchResults({ customers: [], jobs: [{ id: "j1", type: "job", title: "Job", subtitle: "", href: "/jobs?id=j1" }], invoices: [{ id: "1", type: "invoice", title: "INV-1", subtitle: "", href: "/invoices?id=1" }] }).jobs.length, 1);
  for (const href of ["/customers?id=123", "/customers/", "/customers/other-id", "/customers/..", "/customers/%2e%2e", "/customers/%2fexample", "//evil.invalid/customer", "https://evil.invalid", "javascript:alert(1)", `/customers/${customerId}?next=evil`, "/customers/%", `/customers/${customerId}/edit`]) {
    assert.throws(() => parseSearchResults({ ...value, customers: [{ ...value.customers[0], href }] }), href);
  }
  for (const malformed of [null, [], {}, { ...value, jobs: null }, { ...value, customers: [null] }, { ...value, customers: [{ ...value.customers[0], title: 4 }] }, { ...value, customers: [{ ...value.customers[0], type: "job" }] }]) {
    assert.throws(() => parseSearchResults(malformed));
  }
});

test("header rejects unsuccessful HTTP and distinguishes unknown status from valid zero", async () => {
  await assert.rejects(readHeaderJson(Response.json(payload(), { status: 403 })));
  await assert.rejects(readHeaderJson(new Response("not json")));
  assert.equal(parseQuickBooksStatus({ connected: true }), true);
  assert.equal(parseQuickBooksStatus({ connected: false, needsReconnect: true }), false);
  for (const value of [null, {}, { connected: "true" }]) assert.throws(() => parseQuickBooksStatus(value));
  assert.deepEqual(parseDispatchStatus({ stats: { activeTechs: 0, onJob: 0 } }), { activeTechs: 0, onJob: 0 });
  for (const stats of [{}, { activeTechs: "0", onJob: 0 }, { activeTechs: -1, onJob: 0 }, { activeTechs: 0.5, onJob: 0 }, { activeTechs: Infinity, onJob: 0 }, { activeTechs: 1, onJob: 2 }]) {
    assert.throws(() => parseDispatchStatus({ stats }));
  }
});

test("header latest query wins even when the old fetch ignores abort", async () => {
  const h = harness();
  try {
    h.controller.search("older"); await wait(5);
    h.controller.search("latest"); await wait(5);
    assert.equal(h.pending[0].signal.aborted, true);
    h.pending[1].resolve(Response.json(payload("Latest"))); await wait(5);
    h.pending[0].resolve(Response.json(payload("Old"))); await wait(5);
    assert.equal(h.latest().status, "ready");
    assert.equal(h.latest().results.customers[0].title, "Latest");
  } finally { h.controller.dispose(); }
});

test("header ignores old errors and never clears the newer loading state", async () => {
  const h = harness();
  try {
    h.controller.search("older"); await wait(5);
    h.controller.search("newer"); await wait(5);
    h.pending[0].reject(new Error("old failure")); await wait(5);
    assert.equal(h.latest().status, "loading");
    h.pending[1].resolve(Response.json(payload())); await wait(5);
    assert.equal(h.latest().status, "ready");
  } finally { h.controller.dispose(); }
});

test("header dismissal, short queries, and disposal invalidate pending results and debounce", async () => {
  for (const cancel of ["dismiss", "short", "dispose"] as const) {
    const h = harness();
    h.controller.search("pending"); await wait(5);
    if (cancel === "short") h.controller.search(" x "); else h.controller[cancel]();
    const count = h.states.length;
    assert.equal(h.pending[0].signal.aborted, true);
    h.pending[0].resolve(Response.json(payload())); await wait(5);
    assert.equal(h.states.length, count);
    if (cancel !== "dispose") assert.equal(h.latest().status, "idle");
    h.controller.dispose();
  }
  const h = harness();
  h.controller.search("pending"); h.controller.dismiss(); await wait(5);
  assert.equal(h.pending.length, 0);
});

test("header exposes current errors, supports retry, and times out without reopening", async () => {
  const h = harness(30);
  try {
    h.controller.search("failure"); await wait(5);
    h.pending[0].resolve(Response.json({ error: "Forbidden" }, { status: 403 })); await wait(5);
    assert.equal(h.latest().status, "error");
    h.controller.search("failure"); await wait(5);
    h.pending[1].resolve(Response.json(payload())); await wait(5);
    assert.equal(h.latest().status, "ready");
    h.controller.search("timeout"); await wait(50);
    assert.equal(h.latest().status, "error");
    assert.equal(h.pending[2].signal.aborted, true);
    h.controller.dismiss();
    h.pending[2].resolve(Response.json(payload())); await wait(5);
    assert.equal(h.latest().status, "idle");
  } finally { h.controller.dispose(); }
});

test("header identity derives from current authenticated user without stale names or invented roles", () => {
  const first = getDisplayIdentity({ id: "user-a", fullName: "Alex Example", firstName: "Alex" }, true);
  assert.equal(first.name, "Alex Example"); assert.equal(first.initials, "AE"); assert.equal(first.firstName, "Alex");
  const second = getDisplayIdentity({ id: "user-b", fullName: "Blair Demo" }, true);
  assert.equal(second.userId, "user-b"); assert.equal(second.name, "Blair Demo");
  assert.equal(getDisplayIdentity(null, true).name, "Account");
  assert.equal(getDisplayIdentity({ id: "user-a", fullName: "Alex Example" }, false).userId, null);
  assert.equal(getDisplayIdentity({ id: "user-c", primaryEmailAddress: { emailAddress: "test@example.invalid" } }, true).name, "test@example.invalid");
  assert.equal("role" in first, false);
});
