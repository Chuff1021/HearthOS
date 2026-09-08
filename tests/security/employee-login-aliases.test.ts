import assert from "node:assert/strict";
import { test } from "node:test";
import { employeeIdForVerifiedEmail } from "../../src/lib/security/employee-login-aliases";

const id = "11111111-1111-4111-8111-111111111111";
const config = JSON.stringify({ "office@example.test": id });

test("only explicitly configured login emails resolve to an existing employee ID", () => {
  assert.equal(employeeIdForVerifiedEmail(config, "office@example.test"), id);
  assert.equal(employeeIdForVerifiedEmail(config, " Office@Example.Test "), id);
  assert.equal(employeeIdForVerifiedEmail(config, "stranger@example.test"), null);
  assert.equal(employeeIdForVerifiedEmail(undefined, "office@example.test"), null);
});

test("malformed or ambiguous login configuration fails closed", () => {
  for (const invalid of ["{", "null", "[]", '"owner"', '{"office@example.test":"owner"}',
    JSON.stringify({ "office@example.test": id, " OFFICE@example.test ": id })]) {
    assert.throws(() => employeeIdForVerifiedEmail(invalid, "office@example.test"));
  }
});
