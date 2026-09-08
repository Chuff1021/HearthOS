import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccessJob, canUseCrmApi, employeeRole, isAssignedTodo, verifiedPrimaryEmail, type CrmActor, type CrmRole } from "../../src/lib/security/access-policy";

const actor: CrmActor = { clerkUserId: "clerk-one", orgId: "org-one", employeeId: "employee-one", email: "tech@example.test", name: "Test Tech", role: "technician" };

test("only a verified primary email establishes identity", () => {
  const emailAddresses = [
    { id: "other", emailAddress: "owner@example.test", verification: { status: "verified" } },
    { id: "primary", emailAddress: " Tech@Example.Test ", verification: { status: "unverified" } },
  ];
  assert.equal(verifiedPrimaryEmail({ primaryEmailAddressId: "primary", emailAddresses }), null);
  emailAddresses[1].verification.status = "verified";
  assert.equal(verifiedPrimaryEmail({ primaryEmailAddressId: "primary", emailAddresses }), actor.email);
  assert.equal(verifiedPrimaryEmail({ emailAddresses }), null);
});

test("unsupported employee roles fail closed", () => {
  assert.equal(employeeRole({ role: "administrator-ish", isOwner: false }), null);
  assert.equal(employeeRole({ role: "technician", isOwner: false }), "technician");
  assert.equal(employeeRole({ role: "technician", isOwner: true }), "owner");
});

test("job assignment uses exact employee ID, never a name or Clerk ID", () => {
  assert.equal(canAccessJob(actor, { assignedTechs: [{ id: actor.employeeId }] }), true);
  for (const id of [actor.clerkUserId, actor.name, "employee-two", ""]) {
    assert.equal(canAccessJob(actor, { assignedTechs: [{ id }] }), false);
  }
});

test("explicit task assignment takes precedence over legacy email", () => {
  assert.equal(isAssignedTodo(actor, { assignedTo: actor.employeeId }), true);
  assert.equal(isAssignedTodo(actor, { assignedTo: "employee-two", assignedToEmail: actor.email }), false);
  assert.equal(isAssignedTodo(actor, { assignedToEmail: "TECH@example.test" }), true);
  assert.equal(isAssignedTodo(actor, {}), false);
});

const roles: CrmRole[] = ["owner", "admin", "dispatcher", "accounting", "sales", "technician", "read_only"];
for (const role of roles) {
  test(`${role}: unknown APIs are denied`, () => {
    assert.equal(canUseCrmApi({ ...actor, role }, "/api/unclassified", "GET"), false);
    assert.equal(canUseCrmApi({ ...actor, role }, "/api/unclassified", "POST"), false);
  });
}

test("technicians cannot change staff, sync providers, or delete business records", () => {
  for (const route of ["/api/team/invitations", "/api/techs", "/api/quickbooks/sync", "/api/jobs", "/api/invoices", "/api/projects", "/api/gabe/ops/jobs", "/api/time/payroll"]) {
    assert.equal(canUseCrmApi(actor, route, "DELETE"), false, route);
  }
  assert.equal(canUseCrmApi(actor, "/api/jobs", "PUT"), true);
  assert.equal(canUseCrmApi(actor, "/api/tech/me", "GET"), true);
  assert.equal(canUseCrmApi(actor, "/api/time/entries", "POST"), true);
  assert.equal(canUseCrmApi(actor, "/api/time/edit-requests", "PUT"), false);
});

test("read-only cannot mutate known resources", () => {
  for (const route of ["jobs", "customers", "invoices", "estimates", "todos", "projects", "quickbooks/sync", "team/invitations", "time/entries", "expenses"]) {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) assert.equal(canUseCrmApi({ ...actor, role: "read_only" }, `/api/${route}`, method), false, `${method} ${route}`);
  }
});
