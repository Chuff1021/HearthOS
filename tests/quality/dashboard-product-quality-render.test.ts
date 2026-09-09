import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { before, test } from "node:test";
import { build } from "esbuild";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Fixture = { status: "ready" | "loading" | "error"; data: unknown };
const runtime = {
  fixtures: {} as Record<string, Fixture>,
  identity: { firstName: "", isLoaded: false, isSignedIn: false },
  identityCalls: 0,
  process: { env: {} as Record<string, string> },
};
let Dashboard: ComponentType;

before(async () => {
  const bundle = await build({
    absWorkingDir: fileURLToPath(new URL("../../", import.meta.url)),
    entryPoints: ["src/app/page.tsx"], bundle: true, write: false,
    platform: "node", format: "cjs", jsx: "automatic", packages: "external",
    plugins: [{ name: "offline-dashboard-boundaries", setup(builder) {
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, ({ path }) => ({ path, external: true }));
      builder.onResolve({ filter: /^(next\/link|@\/components\/layout\/|@\/components\/dashboard\/(OperationsLeafletMap|useDashboardResource))/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => {
        if (path.endsWith("useDashboardResource")) return { contents: "export function useDashboardResource(source) { return {...globalThis.fixtures[source], retry() {}}; }" };
        if (path.endsWith("header-identity")) return { contents: "export function useAuthenticatedDisplayIdentity() { globalThis.identityCalls++; return globalThis.identity; }" };
        if (path === "next/link") return { contents: "import {createElement} from 'react'; export default function Link({children, ...props}) { return createElement('a', props, children); }" };
        return { contents: "export default function Boundary() { return null; }" };
      });
    } }],
  });
  const bundledModule = { exports: {} as { default: ComponentType } };
  runInNewContext(bundle.outputFiles[0].text, Object.assign(runtime, { module: bundledModule, exports: bundledModule.exports, require: createRequire(import.meta.url) }));
  Dashboard = bundledModule.exports.default;
});

function render(status: Fixture["status"], overrides: Record<string, Fixture> = {}) {
  runtime.fixtures = Object.fromEntries(["profit", "customers", "vendors", "dispatch", "jobs", "activity"].map((key) => [key, { status, data: null }]));
  Object.assign(runtime.fixtures, overrides);
  return renderToStaticMarkup(createElement(Dashboard));
}

test("loading data does not claim zero balances, perfect confidence, empty schedules or live GPS", () => {
  const html = render("loading");
  assert.match(html, /Loading/);
  assert.doesNotMatch(html, /\$0|100%|No jobs are scheduled|fully assigned|live GPS|Route load synced|No customers with/);
  assert.match(html, /href="\/jobs\?create=1"/);
  assert.doesNotMatch(html, /Colton|aria-label="Trend"|Revenue overview chart/);
});

test("failed sources have explicit retry while successful panels remain visible", () => {
  const html = render("error", {
    profit: { status: "ready", data: { windowStats: { revenue: 23000, profit: 8000, cogs: 10000, billable: 5000, margin: 34.8, invoiceCount: 14 } } },
    jobs: { status: "ready", data: [{ id: "fixture-job", title: "Synthetic scheduled job", customerName: "Test customer", status: "scheduled", scheduledTimeStart: "10:00", assignedTechs: [] }] },
  });
  assert.match(html, /\$23\.0K/);
  assert.match(html, /Synthetic scheduled job/);
  assert.match(html, /Data unavailable/);
  assert.match(html, /aria-label="Retry Recent Activity"/);
  assert.doesNotMatch(html, /fully assigned|No customers with an open balance|No recent synced activity/);
});

test("confirmed empty data renders real zeros without invented confidence or healthy-account scores", () => {
  const html = render("ready", {
    profit: { status: "ready", data: { windowStats: { revenue: 0, profit: 0, cogs: 0, billable: 0, margin: null, invoiceCount: 0 } } },
    customers: { status: "ready", data: { items: [], moneyBar: { totalDue: 0, openInvoiceCount: 0, overdueCount: 0 } } },
    vendors: { status: "ready", data: { moneyBar: { totalOwed: 0, openBillCount: 0, overdueCount: 0, openPOValue: 0 } } },
    dispatch: { status: "ready", data: { techs: [], unassignedJobs: [], stats: { activeTechs: 0, onJob: 0, unassigned: 0 } } },
    jobs: { status: "ready", data: [] },
    activity: { status: "ready", data: [] },
  });
  assert.match(html, /No jobs are scheduled for today/);
  assert.match(html, /\$0/);
  assert.match(html, /Jobs Assigned/);
  assert.doesNotMatch(html, /100%|Healthy accounts|Schedule Confidence/);
  assert.match(html, /width:0%/);
  assert.match(html, /min-height:180px/);
  assert.match(html, /Open Balances/);
  assert.match(html, /shrink-0 whitespace-nowrap text-xs font-semibold/);
});

test("greeting uses shared identity only under configured Clerk, with a neutral fallback", () => {
  runtime.process.env = {};
  runtime.identityCalls = 0;
  render("loading");
  assert.equal(runtime.identityCalls, 0);
  runtime.process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "synthetic-test-only";
  runtime.identity = { firstName: "Synthetic", isLoaded: true, isSignedIn: true };
  assert.match(render("loading"), /, Synthetic\./);
  runtime.identity = { firstName: "Synthetic", isLoaded: true, isSignedIn: false };
  assert.doesNotMatch(render("loading"), /, Synthetic\./);
  runtime.process.env = {};
});
