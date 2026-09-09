import test from "node:test";
import assert from "node:assert/strict";
import { parseAction, parseExport, parseSubmission, scheduleHref } from "../../src/lib/website-inbox/domain";
import { canUseCrmApi, type CrmActor } from "../../src/lib/security/access-policy";

const id = "11111111-1111-4111-8111-111111111111";
const submission = { id, type: "contact", createdAt: "2026-09-09T12:00:00Z", name: "Example", email: "test@example.invalid", message: "Help with service" };
test("validates website submissions without trusting extra identity/payment fields", () => {
  const result = parseSubmission({ ...submission, orgId: "foreign", paid: true });
  assert.equal(result.type, "contact");
  assert.equal("orgId" in result, false);
  assert.equal("paid" in result, false);
});
test("preserves order requests and line items without marking them paid", () => {
  const result = parseSubmission({ ...submission, type: "order", total: 300, items: [{ name: "Demo part", sku: "PART-1", quantity: 2, price: 150 }] });
  assert.equal(result.total, 300);
  assert.equal(result.items?.[0].quantity, 2);
});
test("rejects invalid identity, date, contact and nonfinite/negative line amounts", () => {
  for (const patch of [{ id: "bad" }, { createdAt: "bad" }, { name: "" }, { email: "", phone: "" }, { total: -1 }, { items: [{ quantity: 1, price: Infinity }] }, { items: [{ quantity: 0, price: 10 }] }]) {
    assert.throws(() => parseSubmission({ ...submission, ...patch }));
  }
});
test("requires explicit, bounded cursor and complete valid page", () => {
  assert.equal(parseExport({ version: 1, items: [submission], nextCursor: null }).items.length, 1);
  assert.throws(() => parseExport({ version: 1, items: [submission] }));
  assert.throws(() => parseExport({ version: 1, items: [submission, {}], nextCursor: null }));
});
test("validates follow-up date and stable mutation identity", () => {
  const action = { id, actionId: id, revision: 0, status: "follow_up", followUpAt: "2026-09-12", note: "Called today" };
  assert.equal(parseAction(action).note, "Called today");
  assert.throws(() => parseAction({ ...action, followUpAt: "2026-02-30" }));
  assert.throws(() => parseAction({ ...action, followUpAt: "" }));
  assert.throws(() => parseAction({ ...action, revision: -1 }));
  assert.equal(parseAction({ ...action, status: "closed" }).followUpAt, null);
});
test("schedule action prefills but does not invent a CRM customer ID", () => {
  const href = scheduleHref(parseSubmission({ ...submission, metadata: { address: "100 Example St", requestedDate: "2026-10-01" } }));
  const params = new URL(href, "https://example.invalid").searchParams;
  assert.equal(params.get("customerName"), "Example");
  assert.equal(params.get("address"), "100 Example St");
  assert.equal(params.has("customerId"), false);
});
for (const role of ["owner", "admin", "dispatcher", "accounting", "sales", "technician", "read_only"] as const) {
  test(`website inbox ${role} authorization`, () => {
    const actor = { role } as CrmActor;
    for (const method of ["GET", "PATCH", "POST"]) assert.equal(canUseCrmApi(actor, "/api/website-inbox", method), !["technician", "read_only"].includes(role));
  });
}
