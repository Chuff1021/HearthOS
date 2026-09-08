import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

function routes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? routes(path.join(directory, entry.name)) : entry.name === "route.ts" ? [path.join(directory, entry.name)] : []);
}

// These routes have a different trust boundary, not a blanket public exemption.
const separateBoundaries: Record<string, string> = {
  "meeks/jobs/route.ts": "getMeeksApiAccess",
  "square/payments/route.ts": "verifyCustomerLink",
  "estimates/accept/route.ts": "verifyCustomerLink",
  "square/webhook/route.ts": "verifySignature",
  "gabe/support/chatwoot/webhook/route.ts": "timingSafeEqual",
};

test("every exported HTTP handler has an explicit authorization boundary", (context) => {
  const root = path.resolve("src/app/api");
  let count = 0;
  for (const file of routes(root)) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const relative = path.relative(root, file);
    for (const node of source.statements) {
      if (!ts.isFunctionDeclaration(node) || !node.name || !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(node.name.text)) continue;
      assert.ok(node.body, file);
      count++;
      const boundary = separateBoundaries[relative];
      if (boundary) {
        assert.ok(source.text.includes(boundary), `${relative}: review dedicated authorization`);
        continue;
      }
      const expected = relative.startsWith("cron/") ? "authorizeCron" : "authorizeCrmApi";
      const statements = node.body!.statements;
      assert.ok(statements[0]?.getText(source).includes(`await ${expected}(`), `${relative} ${node.name.text}: guard must run first`);
      assert.match(statements[1]?.getText(source) || "", /if \(accessDenied\) return accessDenied/, relative);
    }
  }
  assert.ok(count >= 160, `unexpected handler inventory: ${count}`);
  context.diagnostic(`${count} exported HTTP handlers inventoried; dedicated-boundary checks require their separate runtime tests.`);
});
