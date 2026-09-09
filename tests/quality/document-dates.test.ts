import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = ts.createSourceFile("DocumentDrawer.tsx", readFileSync(
  new URL("../../src/components/documents/DocumentDrawer.tsx", import.meta.url), "utf8"
), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const statement = source.statements.find((node) => ts.isVariableStatement(node)
  && node.declarationList.declarations.some((entry) => entry.name.getText(source) === "fmtDate"));
assert.ok(statement, "Test the actual drawer date formatter");
const code = ts.transpileModule(statement.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const timezone of ["UTC", "America/Chicago", "America/Los_Angeles"]) {
  test(`document date-only values keep their calendar day in ${timezone}`, () => {
    const output = execFileSync(process.execPath, ["-e", `${code}
      console.log(JSON.stringify(["2026-09-09", "2026-01-01", "2026-03-08", null, "not-a-date"].map(fmtDate)));`], {
      env: { ...process.env, TZ: timezone }, encoding: "utf8",
    });
    assert.deepEqual(JSON.parse(output), ["Sep 9, 2026", "Jan 1, 2026", "Mar 8, 2026", "\u2014", "\u2014"]);
  });
}
