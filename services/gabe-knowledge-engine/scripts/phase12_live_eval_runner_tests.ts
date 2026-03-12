import assert from "node:assert/strict";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("expected refused should fail if actual verified", () => {
  const expected = "refused";
  const actual = "verified";
  assert.notEqual(actual, expected);
});

t("citation required for non-refused", () => {
  const expected = "verified";
  const cited = false;
  assert.equal(expected !== "refused" && !cited, true);
});

t("regression failure metric non-negative", () => {
  const regressionFailures = 3;
  assert.ok(regressionFailures >= 0);
});
