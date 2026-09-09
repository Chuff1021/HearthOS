import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const customerId = "11111111-1111-4111-8111-111111111111";
const result = (title) => ({ customers: [{ id: customerId, type: "customer", title, subtitle: "100 Example Street", href: `/customers/${customerId}` }], jobs: [], invoices: [] });

test("header actual component: synthetic identity, statuses, dismissal, keyboard, navigation, and responsive layout", { timeout: 120000 }, async () => {
  const stubs = {
    "next/navigation": `import {useSyncExternalStore} from 'react';
      const subscribe=f=>{addEventListener('popstate',f);return()=>removeEventListener('popstate',f)};
      export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname,()=>'/');`,
    "next/link": `import React from 'react';export default function Link({href,onClick,children,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey){e.preventDefault();history.pushState({},'',href);dispatchEvent(new PopStateEvent('popstate'))}}}>{children}</a>}`,
    "@clerk/nextjs": `import {useSyncExternalStore} from 'react';
      const subscribe=f=>{addEventListener('identity',f);return()=>removeEventListener('identity',f)};
      export const useUser=()=>({isLoaded:true,user:useSyncExternalStore(subscribe,()=>window.fixtureUser,()=>null)});`,
  };
  const bundle = await build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Header from './src/components/layout/Header';
      window.fixtureUser={id:'user-a',fullName:'Synthetic Operator',firstName:'Synthetic'};
      window.requests=[];
      window.fetch=(url,options)=>new Promise(resolve=>window.requests.push({url,signal:options?.signal,resolve}));
      window.respond=(match,body,status=200)=>{const index=window.requests.findIndex(r=>r.url.includes(match));if(index<0)throw Error('No request: '+match);const [r]=window.requests.splice(index,1);r.resolve(Response.json(body,{status}));};
      createRoot(document.getElementById('root')).render(<><Header/><main style={{paddingTop:400}}><button id='outside'>Outside focus</button></main></>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, outdir: '/tmp/hearthos-header-bundle', platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": '"synthetic-only"' },
    plugins: [{ name: "header-offline-adapters", setup(builder) {
      builder.onResolve({ filter: /^(next\/(navigation|link)|@clerk\/nextjs)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const css = (await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: path.resolve("src/app/globals.css") })).css;
  const script = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const moduleCss = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '';
  const server = createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); res.end(script); }
    else if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css + '\n' + moduleCss + ":root{--font-geist-sans:Arial;--font-geist-mono:monospace}"); }
    else if (req.url.startsWith("/api/")) { res.writeHead(503); res.end("No live API access"); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Header offline fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(base);
    const input = page.getByRole("combobox");
    await page.getByRole("link", { name: "Account settings for Synthetic Operator" }).waitFor();
    assert.equal(await page.getByText("QB Checking...", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Techs Checking...", { exact: true }).count(), 1);
    assert.equal(await page.locator("a button, button a").count(), 0);
    assert.equal(await page.getByRole("button", { name: /Notifications|Help/ }).count(), 0);
    await page.evaluate(() => { window.respond("/api/quickbooks/status", { connected: true }); window.respond("/api/dispatch", { error: "Unavailable" }, 503); });
    await page.getByText("QB Connected", { exact: true }).waitFor();
    await page.getByText("Active techs unknown", { exact: true }).waitFor();
    assert.equal(await page.getByText("QB Synced", { exact: true }).count(), 0);
    for (const shortcut of ["Control+k", "Meta+k"]) {
      await page.locator("#outside").focus(); await page.keyboard.press(shortcut);
      assert.equal(await input.evaluate(el => el === document.activeElement), true);
    }
    const waitRequest = query => page.waitForFunction(q => window.requests.some(r => r.url.includes(`q=${q}`)), query);
    const respond = (query, body, status = 200) => page.evaluate(({ query, body, status }) => window.respond(`q=${query}`, body, status), { query, body, status });
    await input.fill("older"); await waitRequest("older");
    await input.fill("latest"); await waitRequest("latest");
    assert.equal(await page.evaluate(() => window.requests.find(r => r.url.includes("q=older")).signal.aborted), true);
    await respond("latest", result("Latest Customer"));
    await page.getByRole("link", { name: /Latest Customer/ }).waitFor();
    await respond("older", result("Old Customer"));
    assert.equal(await page.getByRole("link", { name: /Old Customer/ }).count(), 0);
    await input.press("ArrowDown");
    assert.equal(await page.getByRole("link", { name: /Latest Customer/ }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    for (const action of ["escape", "outside", "tab", "dismiss", "short"]) {
      await input.fill(action); await waitRequest(action);
      if (action === "escape") await input.press("Escape");
      if (action === "outside") await page.locator("#outside").click();
      if (action === "tab") { await input.press("Tab"); await page.keyboard.press("Tab"); }
      if (action === "dismiss") await page.getByRole("button", { name: "Dismiss search" }).click();
      if (action === "short") await input.fill("x");
      assert.equal(await page.getByRole("dialog").count(), 0, action);
      await respond(action, result("Must not reopen"));
      assert.equal(await page.getByRole("dialog").count(), 0, action);
    }
    await input.fill("failed"); await waitRequest("failed");
    await respond("failed", { error: "Forbidden" }, 403);
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "Retry search" }).click(); await waitRequest("failed");
    await respond("failed", result("Retried Customer"));
    await page.getByRole("link", { name: /Retried Customer/ }).waitFor();
    await input.focus(); await waitRequest("failed"); await respond("failed", result("Retried Customer"));
    await page.getByRole("link", { name: /Retried Customer/ }).waitFor();
    await input.press("ArrowUp"); await page.keyboard.press("Enter");
    await page.waitForURL(`**/customers/${customerId}`);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await input.inputValue(), "");
    await page.evaluate(() => { window.fixtureUser = { id: "user-b", fullName: "Another Person", firstName: "Another" }; dispatchEvent(new Event("identity")); });
    await page.getByRole("link", { name: "Account settings for Another Person" }).waitFor();
    assert.equal(await page.getByText("Synthetic Operator", { exact: true }).count(), 0);
    const output = process.env.HEADER_SCREENSHOT_DIR || "/tmp/hearthos-header-quality";
    await mkdir(output, { recursive: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await input.fill(`screen${width}`); await waitRequest(`screen${width}`);
      await respond(`screen${width}`, result("Synthetic Customer With A Long Display Name"));
      await page.getByRole("link", { name: /Synthetic Customer With/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const bounds = await page.getByRole("dialog").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `Popup fits at ${width}px`);
      const header = await page.locator("header").boundingBox();
      const field = await input.boundingBox();
      assert.ok(header.height < 110, `Open search must not resize the toolbar at ${width}px`);
      assert.ok(bounds.y >= field.y + field.height, "Popup must sit below the input");
      assert.equal(await page.getByRole("link", { name: /Synthetic Customer With/ }).evaluate(el => {
        const rect = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      }), true, "Result must not be clipped by the toolbar");
      await page.screenshot({ path: path.join(output, `header-${width}.png`) });
      await input.press("Escape");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.getByRole("button", { name: "Switch to light mode" }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await input.fill(`dark${width}`); await waitRequest(`dark${width}`);
      await respond(`dark${width}`, result("Synthetic Dark Mode Customer"));
      await page.getByRole("link", { name: /Synthetic Dark Mode/ }).waitFor();
      assert.equal(await page.getByRole("dialog").getByRole("status").evaluate(el => el.style.color), "var(--color-text-muted)");
      assert.equal(await page.getByRole("heading", { name: "Customers" }).evaluate(el => el.style.color), "var(--color-text-muted)");
      await page.screenshot({ path: path.join(output, `header-dark-${width}.png`) });
      if (width === 1440) {
        await page.getByRole("link", { name: /Synthetic Dark Mode/ }).focus();
        await page.screenshot({ path: path.join(output, "header-dark-focus-1440.png") });
      }
      await input.press("Escape");
    }
    await input.fill("darkerror"); await waitRequest("darkerror");
    await respond("darkerror", { error: "Unavailable" }, 503);
    await page.getByRole("alert").waitFor();
    await page.screenshot({ path: path.join(output, "header-dark-error-390.png") });
    await input.press("Escape");
    await page.evaluate(() => { window.fixtureUser = null; dispatchEvent(new Event("identity")); });
    await page.getByRole("link", { name: "Account settings", exact: true }).waitFor();
    assert.equal(await page.getByText("Another Person", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`Offline header screenshots: ${output}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
