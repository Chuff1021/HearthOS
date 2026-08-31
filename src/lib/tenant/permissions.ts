export const MEMBERSHIP_ROLES = [
  "owner",
  "admin",
  "dispatcher",
  "accounting",
  "sales",
  "technician",
  "read_only",
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const PERMISSIONS = [
  "organization:read",
  "organization:manage",
  "members:read",
  "members:manage",
  "customers:read",
  "customers:write",
  "jobs:read",
  "jobs:write",
  "schedule:read",
  "schedule:write",
  "time:read",
  "time:write",
  "financials:read",
  "financials:write",
  "inventory:read",
  "inventory:write",
  "reports:read",
  "integrations:read",
  "integrations:manage",
  "files:read",
  "files:write",
  "gabe:use",
  "gabe:manage",
  "support:request",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const allPermissions = new Set<Permission>(PERMISSIONS);

const rolePermissions: Record<MembershipRole, ReadonlySet<Permission>> = {
  owner: allPermissions,
  admin: allPermissions,
  dispatcher: new Set([
    "organization:read",
    "members:read",
    "customers:read",
    "customers:write",
    "jobs:read",
    "jobs:write",
    "schedule:read",
    "schedule:write",
    "time:read",
    "time:write",
    "financials:read",
    "inventory:read",
    "reports:read",
    "files:read",
    "files:write",
    "gabe:use",
    "support:request",
  ]),
  accounting: new Set([
    "organization:read",
    "members:read",
    "customers:read",
    "jobs:read",
    "schedule:read",
    "time:read",
    "financials:read",
    "financials:write",
    "inventory:read",
    "reports:read",
    "integrations:read",
    "files:read",
    "files:write",
    "gabe:use",
    "support:request",
  ]),
  sales: new Set([
    "organization:read",
    "customers:read",
    "customers:write",
    "jobs:read",
    "jobs:write",
    "schedule:read",
    "schedule:write",
    "time:read",
    "time:write",
    "financials:read",
    "inventory:read",
    "files:read",
    "files:write",
    "gabe:use",
    "support:request",
  ]),
  technician: new Set([
    "organization:read",
    "customers:read",
    "jobs:read",
    "jobs:write",
    "schedule:read",
    "time:read",
    "time:write",
    "files:read",
    "files:write",
    "gabe:use",
    "support:request",
  ]),
  read_only: new Set([
    "organization:read",
    "members:read",
    "customers:read",
    "jobs:read",
    "schedule:read",
    "time:read",
    "financials:read",
    "inventory:read",
    "reports:read",
    "integrations:read",
    "files:read",
    "gabe:use",
    "support:request",
  ]),
};

export function isMembershipRole(value: unknown): value is MembershipRole {
  return MEMBERSHIP_ROLES.includes(value as MembershipRole);
}

export function permissionsForRole(
  role: MembershipRole,
  overrides: unknown,
): ReadonlySet<Permission> {
  const permissions = new Set(rolePermissions[role]);
  if (!Array.isArray(overrides)) return permissions;

  for (const value of overrides) {
    if (typeof value === "string" && allPermissions.has(value as Permission)) {
      permissions.add(value as Permission);
    }
  }
  return permissions;
}
