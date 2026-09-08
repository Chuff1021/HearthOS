import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("service worker never caches private pages or API/file responses", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const deleted: string[] = [];
  let cacheReads = 0;
  let cacheWrites = 0;
  runInNewContext(readFileSync("public/tech-sw.js", "utf8"), {
    self: { addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; }, skipWaiting: () => {}, clients: { claim: () => {} }, location: { origin: "https://example.test" } },
    caches: {
      keys: async () => ["hearth-tech-v1", "hearth-tech-public-v2", "unrelated-app-cache"],
      delete: async (key: string) => { deleted.push(key); },
      match: async () => { cacheReads++; return new Response("old private page"); },
      open: async () => ({ put: () => { cacheWrites++; }, addAll: () => {} }),
    },
    fetch: async () => { throw new Error("offline"); }, URL, Response,
  });
  let activation: Promise<unknown> | undefined;
  handlers.activate({ waitUntil: (promise: Promise<unknown>) => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ["hearth-tech-v1"]);
  let result: Promise<Response> | undefined;
  handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://example.test/tech/job/private-id" }, respondWith: (promise: Promise<Response>) => { result = promise; } });
  const response = await result!;
  assert.equal(response.status, 503);
  assert.match(await response.text(), /You are offline/);
  assert.equal(cacheReads, 0);
  assert.equal(cacheWrites, 0);
  for (const url of ["/api/jobs", "/api/expenses/id/receipt.png", "/private/customer-photo.png"]) {
    let intercepted = false;
    handlers.fetch({ request: { method: "GET", mode: "cors", url: `https://example.test${url}` }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, url);
  }
});
