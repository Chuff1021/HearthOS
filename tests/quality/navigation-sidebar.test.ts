import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isActivePath, mobileNavItems, navigationGroups } from "../../src/components/layout/navigation-model";

const expectedRoutes = [
  "/", "/todos", "/schedule", "/projects", "/meeks", "/jobs", "/customers",
  "/service-map", "/dispatch", "/invoices", "/payments", "/expenses", "/estimates",
  "/purchase-orders", "/inventory", "/vendors", "/banking", "/reports", "/gabe",
  "/team", "/admin/gabe-audit", "/admin/time", "/settings", "/integrations/quickbooks",
];

test("navigation preserves every existing route including Aaron's Meeks and GABE tools", () => {
  const routes = navigationGroups.flatMap((group) => group.items.map((item) => item.href));
  assert.deepEqual(routes, expectedRoutes);
  assert.equal(new Set(routes).size, routes.length);
  assert.deepEqual(mobileNavItems.map((item) => item.href), ["/", "/schedule", "/jobs", "/customers"]);
});

test("active paths match route segments, not shared prefixes or the root", () => {
  for (const href of expectedRoutes) {
    assert.equal(isActivePath(href, href), true);
    assert.equal(isActivePath(null, href), false);
    if (href !== "/") {
      assert.equal(isActivePath(`${href}/detail`, href), true);
      assert.equal(isActivePath(`${href}-other`, href), false);
    }
  }
  assert.equal(isActivePath("/customers/fixture", "/"), false);
  assert.equal(isActivePath("/admin/gabe-audit", "/gabe"), false);
});

async function renderSidebar({ collapsed = false, pathname = "/customers/fixture", authenticated = false } = {}) {
  const output = await build({
    entryPoints: ["src/components/layout/Sidebar.tsx"], bundle: true, write: false,
    platform: "node", format: "cjs", external: ["react", "react/jsx-runtime"],
    define: { "process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": JSON.stringify(authenticated ? "offline-fixture" : "") },
    plugins: [{ name: "navigation-offline-fixtures", setup(builder) {
      builder.onResolve({ filter: /^(next\/link|next\/navigation|@clerk\/nextjs)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "next/link"
        ? 'import { createElement } from "react"; export default function Link({prefetch, ...props}) { return createElement("a", props); }'
        : path === "next/navigation"
          ? `export const usePathname = () => ${JSON.stringify(pathname)};`
          : 'export const useUser = () => globalThis.__navigationUser();' }));
    } }],
  });
  const loaded = { exports: {} as { default: React.ComponentType } };
  const require = createRequire(import.meta.url);
  let stateCalls = 0;
  let userCalls = 0;
  runInNewContext(output.outputFiles[0].text, {
    module: loaded, exports: loaded.exports,
    require: (id: string) => id === "react" ? {
      ...React,
      useState: (initial: unknown) => React.useState(stateCalls++ === 0 ? collapsed : initial),
      useSyncExternalStore: () => true,
    } : require(id),
    __navigationUser: () => {
      userCalls++;
      assert.equal(authenticated, true, "Clerk hook must not run without a configured provider");
      return { isLoaded: true, user: { id: "offline-user", fullName: "Morgan Test", firstName: "Morgan" } };
    },
    fetch: () => { throw new Error("Navigation tests must never access the network"); },
  });
  return { html: renderToStaticMarkup(React.createElement(loaded.exports.default)), userCalls };
}

test("collapsed sidebar keeps every icon link named and marks the active destination", async () => {
  const { html, userCalls } = await renderSidebar({ collapsed: true });
  const aside = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
  assert.match(aside, /data-collapsed="true"/);
  assert.match(aside, /aria-label="Expand sidebar"/);
  assert.match(aside, /aria-expanded="false"/);
  assert.equal((aside.match(/<a /g) || []).length, expectedRoutes.length + 1);
  for (const anchor of aside.match(/<a\b[^>]*>/g) || []) assert.match(anchor, /aria-label="[^"]+"/);
  assert.match(aside, /aria-label="Customers" aria-current="page"/);
  assert.match(aside, /title="QuickBooks"/);
  assert.match(aside, /aria-label="Account: account settings"/);
  assert.doesNotMatch(aside, /Colton|Owner|>CH<|>SYNC</);
  assert.equal(userCalls, 0);
});

test("mobile dock exposes daily destinations and More renders the complete route catalogue", async () => {
  const { html } = await renderSidebar({ pathname: "/admin/time" });
  const dock = html.slice(html.indexOf('<nav class="hearth-mobile-dock"'), html.indexOf("<dialog"));
  assert.match(dock, /aria-label="Schedule"/);
  assert.match(dock, /aria-label="Customers"/);
  assert.match(dock, /aria-label="More navigation" aria-haspopup="dialog" aria-expanded="false"/);
  assert.match(dock, /data-active="true"/);
  const dialog = html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>"));
  assert.match(dialog, /aria-labelledby="[^"]+"/);
  assert.match(dialog, /aria-label="Close navigation"/);
  for (const href of expectedRoutes) assert.ok(dialog.includes(`href="${href}"`), `${href} remains in More`);
  assert.match(dialog, /aria-label="Time Admin" aria-current="page"/);
});

test("sidebar reuses authenticated display identity without asserting an employee role", async () => {
  const { html, userCalls } = await renderSidebar({ authenticated: true });
  assert.match(html, /Morgan Test: account settings/);
  assert.match(html, />MT<\/span>/);
  assert.doesNotMatch(html, /Colton|Owner/);
  assert.equal(userCalls, 1);
});

test("native drawer retains modal focus and dismissal wiring", () => {
  const source = readFileSync("src/components/layout/Sidebar.tsx", "utf8");
  assert.match(source, /dialogRef\.current\?\.showModal\(\)/);
  assert.match(source, /onCancel=\{closeDrawer\}/);
  assert.match(source, /onClose=\{/);
  assert.match(source, /triggerRef\.current\.focus\(\)/);
  assert.match(source, /\[pathname\]/);
  assert.match(source, /desktop\.addEventListener\("change", closeOnDesktop\)/);
  assert.match(source, /desktop\.removeEventListener\("change", closeOnDesktop\)/);
  assert.match(source, /event\.clientY < bounds\.top/);
  assert.match(source, /event\.shiftKey && document\.activeElement === first/);
  assert.match(source, /!event\.shiftKey && document\.activeElement === last/);
});
