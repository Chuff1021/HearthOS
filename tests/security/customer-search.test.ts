import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";

test("customer search binds literal terms and returns complete recorded address fields", async () => {
  const result = await build({
    entryPoints: ["src/lib/customer-search.ts"], bundle: true, write: false, platform: "node", format: "cjs",
    external: ["drizzle-orm", "drizzle-orm/pg-core"],
    plugins: [{ name: "schema-only", setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: path.resolve("src/db/schema.ts") }));
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export {};" }));
    } }],
  });
  const loaded = { exports: {} as Record<string, (...args: any[]) => any> };
  runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, require: createRequire(import.meta.url) });
  const dialect = new PgDialect();
  const query = dialect.sqlToQuery(loaded.exports.customerSearchPredicate("Jane Example"));
  assert.ok(query.params.includes("%Jane%"));
  assert.ok(query.params.includes("%Example%"));
  assert.match(query.sql, / and /i);
  const escaped = dialect.sqlToQuery(loaded.exports.customerSearchPredicate("A_%"));
  assert.ok(escaped.params.includes("%A\\_\\%%"));
  const injected = dialect.sqlToQuery(loaded.exports.customerSearchPredicate("' OR 1=1"));
  assert.ok(!injected.sql.includes("' OR 1=1"));
  const phone = dialect.sqlToQuery(loaded.exports.customerSearchPredicate("717-555-0100"));
  assert.ok(phone.params.includes("%7175550100%"));
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.exports.customerAddress({ addressLine1: "100 Example St", addressLine2: "Lot 5", city: "Test City", state: "PA", zip: "17000" }))), { line1: "100 Example St", line2: "Lot 5", city: "Test City", state: "PA", zip: "17000" });
});
