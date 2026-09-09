import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postcss from "postcss";

const read = (path: string) => readFileSync(path, "utf8");
const css = postcss.parse(read("src/app/production-workspaces.css"));

test("workspace CSS is prefixed, screen-only, and cannot target the shared shell or map renderer", () => {
  css.walkRules((rule) => {
    for (const selector of rule.selectors) {
      assert.match(selector, /\.pw-[\w-]+/, selector);
      assert.doesNotMatch(selector, /\.hearth-|\.leaflet-|\.ops-map-canvas|canvas|iframe/, selector);
    }
    let node = rule.parent;
    let screenOnly = false;
    while (node) {
      if (node.type === "atrule" && node.name === "media" && node.params === "screen") screenOnly = true;
      node = node.parent;
    }
    assert.ok(screenOnly, rule.selector);
  });
});

test("page-owned styles cover the existing workspace entries without changing print or redirect pages", () => {
  const pages = ["todos", "website-inbox", "service-map", "dispatch", "meeks", "inventory", "vendors", "reports", "team", "settings", "integrations/quickbooks", "admin", "gabe"];
  for (const page of pages) {
    const source = read(`src/app/${page}/page.tsx`);
    assert.match(source, /import "@\/app\/production-workspaces\.css"/);
    assert.match(source, /pw-workspace/);
    assert.doesNotMatch(source, /className="[^"]*pw-[^"]*"[^>]*>\s*<Sidebar/);
  }
  const tech = read("src/app/tech/layout.tsx");
  assert.match(tech, /production-tech/);
  assert.match(tech, /GeistSans\.className/);
  assert.match(tech, /<GpsStatusProvider>/);
  assert.match(tech, /<TechAuthGate>/);
  assert.doesNotMatch(read("src/app/tech/job/[jobId]/report/page.tsx"), /pw-workspace|production-workspaces/);
  assert.match(read("src/app/tech/gabe/page.tsx"), /router\.replace\("\/tech"\)/);
});

test("workspace theme follows shared semantic tokens and standalone dark pages define readable surfaces", () => {
  const declarations = (selector: string) => {
    const values: Record<string, string> = {};
    css.walkRules((rule) => {
      if (rule.selector === selector) rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
    });
    return values;
  };
  const workspace = declarations(".pw-workspace");
  assert.match(workspace["--pw-surface"], /var\(--color-surface-1/);
  assert.match(workspace["--pw-line"], /var\(--color-border/);
  const dark = declarations(':root[data-theme="dark"] .pw-standalone');
  for (const token of ["--color-bg", "--color-surface-1", "--color-text-primary", "--color-text-muted"]) assert.ok(dark[token], token);
  assert.equal(dark["color-scheme"], "dark");
  assert.ok(declarations(':root[data-theme="dark"] .pw-workspace')["--pw-selected"]);
});

test("task selection remains explicit and narrow layouts allow wrapping and table scrolling", () => {
  assert.match(read("src/app/todos/page.tsx"), /aria-pressed=\{clickable \? isActive : undefined\}/);
  assert.match(read("src/app/team/page.tsx"), /aria-pressed=\{filter === tab.id\}/);
  assert.match(read("src/app/settings/page.tsx"), /aria-pressed=\{activeTab === tab.id\}/);
  assert.ok(css.toString().includes("grid-template-columns: 36px minmax(0, 1fr)"));
  assert.ok(css.toString().includes("overflow-x: auto"));
  assert.ok(css.toString().includes("flex-wrap: wrap"));
});

test("workspace typography and controls defeat legacy defaults without affecting public pages", () => {
  const selectors = new Map<string, Record<string, string>>();
  css.walkRules((rule) => {
    const values = selectors.get(rule.selector) || {};
    rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
    selectors.set(rule.selector, values);
  });
  assert.equal(selectors.get(".pw-workspace h2")?.["font-size"], "16px");
  assert.equal(selectors.get(".pw-workspace h3")?.["font-size"], "14px");
  assert.equal(selectors.get(".pw-workspace button")?.["border-radius"], "6px");
  assert.equal(selectors.get(".pw-workspace .pw-dialog")?.["max-height"], "calc(100dvh - 32px)");
  assert.equal(selectors.get(".pw-workspace .pw-dialog")?.["overflow-y"], "auto");
  assert.equal(selectors.get(".pw-workspace")?.["--pw-selected-text"], "#a83b08");
  assert.ok(css.toString().includes('.pw-segmented > button[aria-pressed="true"]'));
});

test("legacy portals receive page styles as well as the underlying workspace", () => {
  for (const file of ["team", "inventory", "vendors/[id]", "admin/time", "admin/gabe-audit", "reports/profit-by-job"]) {
    const source = read(`src/app/${file}/page.tsx`);
    const overlays = [...source.matchAll(/className="([^"]*fixed inset-0[^"]*)"/g)];
    assert.ok(overlays.length, `${file}: dialog coverage`);
    for (const [, classes] of overlays) assert.match(classes, /pw-workspace/, `${file}: ${classes}`);
  }
  assert.doesNotMatch(read("src/app/team/page.tsx"), /bg-\[#1a1a2e\]/);
  assert.doesNotMatch(read("src/app/admin/gabe-audit/page.tsx"), /bg-\[#1a1a2e\]/);
});
