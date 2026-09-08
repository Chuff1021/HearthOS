export type CrmRole = "owner" | "admin" | "dispatcher" | "accounting" | "sales" | "technician" | "read_only";

export type CrmActor = {
  clerkUserId: string;
  orgId: string;
  employeeId: string;
  email: string;
  name: string;
  role: CrmRole;
};

export function verifiedPrimaryEmail(user: {
  primaryEmailAddressId?: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string; verification?: { status: string } | null }>;
}) {
  const primary = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId);
  return primary?.verification?.status === "verified" ? primary.emailAddress.trim().toLowerCase() : null;
}

export function employeeRole(employee: { role: string; isOwner: boolean | null }): CrmRole | null {
  if (employee.isOwner) return "owner";
  const roles: CrmRole[] = ["admin", "dispatcher", "accounting", "sales", "technician", "read_only"];
  return roles.includes(employee.role as CrmRole) ? employee.role as CrmRole : null;
}

export function isOfficeActor(actor: CrmActor) {
  return ["owner", "admin", "dispatcher", "accounting", "sales"].includes(actor.role);
}

export function canAccessJob(actor: CrmActor, job: { assignedTechs: Array<{ id: string }> }) {
  return actor.role !== "technician" || job.assignedTechs.some((tech) => tech.id === actor.employeeId);
}

export const TECH_JOB_FIELDS = new Set(["status", "notes", "checklistItems", "checklistForm", "photos", "completedAt"]);

export function isAssignedTodo(actor: CrmActor, todo: { assignedTo?: string; assignedToEmail?: string }) {
  return todo.assignedTo ? todo.assignedTo === actor.employeeId : todo.assignedToEmail?.trim().toLowerCase() === actor.email;
}

// Unknown routes are denied even to administrators until classified here.
export function canUseCrmApi(actor: CrmActor, route: string, method: string) {
  const read = method === "GET" || method === "HEAD";
  const resource = route.split("/")[2];
  const known = new Set([
    "access", "audit-logs", "banking", "bills", "customer-lookup", "customers", "dashboard", "dispatch",
    "estimates", "estimator", "expenses", "gabe", "gabe-test", "inventory", "invoices", "items",
    "jobs", "manuals", "mapbox", "pnl", "projects", "purchase-orders", "quickbooks", "reports",
    "schedule", "search", "service-map", "square", "team", "tech", "techs", "time", "time-off-requests", "todos",
  ]);
  if (!known.has(resource)) return false;
  if (resource === "access") return route === "/api/access" && read;
  if (actor.role === "owner" || actor.role === "admin") return true;
  if (resource === "team" || resource === "audit-logs" || resource === "gabe-test") return false;
  if (route.startsWith("/api/gabe/ops/") || route.includes("test-engine") || route.includes("price-audit") || route.endsWith("/trim")) return false;
  if (resource === "manuals" && !read) return false;
  if (resource === "quickbooks") {
    if (!read || /\/(connect|disconnect|callback|sync|sync-all)(\/|$)/.test(route)) return false;
    return actor.role !== "technician" || /\/(customers|items)$/.test(route);
  }
  if (resource === "techs") return read;
  if (resource === "time") {
    if (route.endsWith("/payroll")) return actor.role === "accounting";
    if (actor.role === "technician") return (read || method === "POST") && !route.endsWith("/payroll");
    return ["dispatcher", "accounting"].includes(actor.role);
  }
  if (resource === "time-off-requests") return actor.role === "technician" ? read || method === "POST" : actor.role === "dispatcher";
  if (actor.role === "read_only") return read && !["banking", "tech", "expenses", "square"].includes(resource);
  if (actor.role === "technician") {
    if (resource === "jobs") return read || (route === "/api/jobs" && method === "PUT");
    if (["tech", "expenses"].includes(resource)) return true;
    if (resource === "invoices") return route === "/api/invoices" && method === "POST";
    if (resource === "gabe") return route === "/api/gabe" && method === "POST";
    if (resource === "todos") return read || method === "PUT";
    if (resource === "mapbox") return true;
    return read && ["customer-lookup", "items", "inventory", "manuals"].includes(resource);
  }
  if (["banking", "square"].includes(resource)) return actor.role === "accounting";
  if (["bills", "reports", "pnl"].includes(resource)) return read || actor.role === "accounting";
  return true;
}
