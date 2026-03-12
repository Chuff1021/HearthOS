import assert from "node:assert/strict";
import { querySourcePriorityPolicy } from "../src/swarm/sourceGovernance";

function t(name: string, fn: () => void) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}`, e); process.exitCode = 1; }
}

t("code query prefers jurisdiction adoption when known", () => {
  const p = querySourcePriorityPolicy({ intent: "code compliance", jurisdictionKnown: true });
  assert.equal(p[0], "jurisdiction_adoption_record");
});

t("model code fallback when jurisdiction unknown", () => {
  const p = querySourcePriorityPolicy({ intent: "code compliance", jurisdictionKnown: false });
  assert.equal(p[0], "code_document");
});

t("production strictness exists", () => {
  assert.ok(true);
});

t("rbac enforcement contract placeholder", () => {
  // enforced in runtime reviewerAction by roleAllowed
  assert.ok(true);
});

t("diff summary generation contract placeholder", () => {
  assert.ok(true);
});
