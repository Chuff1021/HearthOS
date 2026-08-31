import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  authIdentities,
  db,
  organizationMemberships,
  organizationInvitations,
  organizations,
  supportAccessSessions,
  users,
  type Organization,
} from "@/db";
import { isClerkConfigured } from "@/lib/auth";
import {
  type MembershipRole,
  type Permission,
  isMembershipRole,
  permissionsForRole,
} from "@/lib/tenant/permissions";

export type TenantContextSource = "membership" | "legacy_bridge" | "local_development" | "support_session";

export type TenantContext = {
  organization: Organization;
  orgId: string;
  identityId: string | null;
  membershipId: string | null;
  clerkUserId: string | null;
  clerkOrganizationId: string | null;
  email: string;
  role: MembershipRole;
  permissions: ReadonlySet<Permission>;
  isPlatformAdmin: boolean;
  supportSessionId: string | null;
  supportAccessMode: "read_only" | "read_write" | null;
  source: TenantContextSource;
};

export class TenantAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 409 | 503,
    public readonly code: string,
  ) {
    super(message);
    this.name = "TenantAccessError";
  }
}

export function isTenantFoundationEnabled() {
  return process.env.MULTITENANT_FOUNDATION_ENABLED === "true";
}

export function isTenantEnforcementEnabled() {
  return process.env.MULTITENANT_ENFORCEMENT_ENABLED === "true";
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isSafeLocalBypass() {
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

async function getLegacyOrganization() {
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "default"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);

  if (!organization) {
    throw new TenantAccessError(
      "The existing HearthOS organization could not be resolved.",
      503,
      "legacy_organization_missing",
    );
  }
  return organization;
}

function roleFromLegacyUser(user: { role: string; isOwner: boolean | null }): MembershipRole {
  if (user.isOwner) return "owner";
  if (user.role === "admin") return "admin";
  if (user.role === "dispatcher") return "dispatcher";
  if (user.role === "technician") return "technician";
  return "read_only";
}

async function resolveLegacyAccess(email: string) {
  const organization = await getLegacyOrganization();
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const [employee] = email
    ? await db
        .select({ id: users.id, role: users.role, isOwner: users.isOwner, isActive: users.isActive })
        .from(users)
        .where(and(eq(users.orgId, organization.id), eq(users.email, email)))
        .limit(1)
    : [];

  if (email !== adminEmail && (!employee || employee.isActive === false)) {
    throw new TenantAccessError(
      "Your login is not assigned to a HearthOS organization.",
      403,
      "organization_membership_required",
    );
  }

  return {
    organization,
    employee,
    role: email === adminEmail ? ("owner" as const) : roleFromLegacyUser(employee!),
  };
}

async function upsertIdentity(input: {
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}) {
  const platformRole = input.email === normalizeEmail(process.env.ADMIN_EMAIL)
    ? "platform_admin"
    : "none";
  const [identity] = await db
    .insert(authIdentities)
    .values({
      clerkUserId: input.clerkUserId,
      primaryEmail: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      avatarUrl: input.avatarUrl,
      lastLoginAt: new Date(),
      platformRole,
    })
    .onConflictDoUpdate({
      target: authIdentities.clerkUserId,
      set: {
        primaryEmail: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        avatarUrl: input.avatarUrl,
        lastLoginAt: new Date(),
        platformRole,
        updatedAt: new Date(),
      },
    })
    .returning();
  return identity;
}

export async function requireAuthenticatedIdentity() {
  if (!isClerkConfigured()) {
    throw new TenantAccessError("Authentication is not configured.", 503, "authentication_unavailable");
  }
  if (!isTenantFoundationEnabled()) {
    throw new TenantAccessError(
      "Organization onboarding is not enabled yet.",
      503,
      "tenant_foundation_disabled",
    );
  }
  const session = await auth();
  if (!session.userId) {
    throw new TenantAccessError("Sign in to continue.", 401, "authentication_required");
  }
  const clerkUser = await currentUser();
  const email = normalizeEmail(
    clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress,
  );
  if (!email) {
    throw new TenantAccessError("Your login needs a verified email address.", 403, "email_required");
  }
  const identity = await upsertIdentity({
    clerkUserId: session.userId,
    email,
    firstName: clerkUser?.firstName || null,
    lastName: clerkUser?.lastName || null,
    avatarUrl: clerkUser?.imageUrl || null,
  });
  return { identity, clerkUserId: session.userId, email };
}

async function resolveMembership(identityId: string, clerkOrganizationId: string | null) {
  if (clerkOrganizationId) {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrganizationId, clerkOrganizationId))
      .limit(1);
    if (!organization) return null;

    const [membership] = await db
      .select()
      .from(organizationMemberships)
      .where(and(
        eq(organizationMemberships.identityId, identityId),
        eq(organizationMemberships.orgId, organization.id),
        eq(organizationMemberships.status, "active"),
      ))
      .limit(1);
    return membership ? { organization, membership } : null;
  }

  const memberships = await db
    .select({ membership: organizationMemberships, organization: organizations })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.orgId, organizations.id))
    .where(and(
      eq(organizationMemberships.identityId, identityId),
      eq(organizationMemberships.status, "active"),
    ))
    .limit(2);

  if (memberships.length > 1) {
    throw new TenantAccessError(
      "Select a company before continuing.",
      409,
      "active_organization_required",
    );
  }
  return memberships[0] || null;
}

async function resolveSupportSession(identityId: string) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("hearthos_support_session")?.value;
  if (!sessionId) return null;
  const [session] = await db
    .select()
    .from(supportAccessSessions)
    .where(and(
      eq(supportAccessSessions.id, sessionId),
      eq(supportAccessSessions.actorIdentityId, identityId),
    ))
    .limit(1);
  if (!session || !["approved", "active"].includes(session.status)) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || (session.startsAt && session.startsAt.getTime() > now)) return null;
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  if (!organization) return null;
  if (session.status === "approved") {
    await db
      .update(supportAccessSessions)
      .set({ status: "active", startsAt: session.startsAt || new Date() })
      .where(eq(supportAccessSessions.id, session.id));
  }
  return { session, organization };
}

async function ensureLegacyMembership(input: {
  identityId: string;
  email: string;
}) {
  const legacy = await resolveLegacyAccess(input.email);
  const [membership] = await db
    .insert(organizationMemberships)
    .values({
      orgId: legacy.organization.id,
      identityId: input.identityId,
      employeeUserId: legacy.employee?.id || null,
      role: legacy.role,
      status: "active",
      acceptedAt: new Date(),
      lastActiveAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [organizationMemberships.orgId, organizationMemberships.identityId],
      set: {
        employeeUserId: legacy.employee?.id || null,
        status: "active",
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  return { organization: legacy.organization, membership };
}

async function acceptPendingInvitation(input: {
  identityId: string;
  email: string;
  clerkOrganizationId: string | null;
}) {
  if (!input.clerkOrganizationId) return null;
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.clerkOrganizationId, input.clerkOrganizationId))
    .limit(1);
  if (!organization) return null;

  const [invitation] = await db
    .select()
    .from(organizationInvitations)
    .where(and(
      eq(organizationInvitations.orgId, organization.id),
      eq(organizationInvitations.email, input.email),
      eq(organizationInvitations.status, "pending"),
    ))
    .orderBy(asc(organizationInvitations.createdAt))
    .limit(1);
  if (!invitation) return null;

  const role = isMembershipRole(invitation.role) ? invitation.role : "read_only";
  const [membership] = await db
    .insert(organizationMemberships)
    .values({
      orgId: organization.id,
      identityId: input.identityId,
      role,
      status: "active",
      invitedByIdentityId: invitation.invitedByIdentityId,
      acceptedAt: new Date(),
      lastActiveAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [organizationMemberships.orgId, organizationMemberships.identityId],
      set: { role, status: "active", acceptedAt: new Date(), updatedAt: new Date() },
    })
    .returning();
  await db
    .update(organizationInvitations)
    .set({ status: "accepted", acceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizationInvitations.id, invitation.id));
  return { organization, membership };
}

async function resolveTenantContextUncached(): Promise<TenantContext> {
  if (!isClerkConfigured()) {
    if (!isSafeLocalBypass()) {
      throw new TenantAccessError("Authentication is not configured.", 503, "authentication_unavailable");
    }
    const organization = await getLegacyOrganization();
    return {
      organization,
      orgId: organization.id,
      identityId: null,
      membershipId: null,
      clerkUserId: null,
      clerkOrganizationId: null,
      email: "local@hearthos.test",
      role: "owner",
      permissions: permissionsForRole("owner", []),
      isPlatformAdmin: true,
      supportSessionId: null,
      supportAccessMode: null,
      source: "local_development",
    };
  }

  const session = await auth();
  if (!session.userId) {
    throw new TenantAccessError("Sign in to continue.", 401, "authentication_required");
  }

  const clerkUser = await currentUser();
  const email = normalizeEmail(
    clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress,
  );
  if (!email) {
    throw new TenantAccessError("Your login needs a verified email address.", 403, "email_required");
  }

  if (!isTenantFoundationEnabled()) {
    const legacy = await resolveLegacyAccess(email);
    return {
      organization: legacy.organization,
      orgId: legacy.organization.id,
      identityId: null,
      membershipId: null,
      clerkUserId: session.userId,
      clerkOrganizationId: session.orgId || null,
      email,
      role: legacy.role,
      permissions: permissionsForRole(legacy.role, []),
      isPlatformAdmin: email === normalizeEmail(process.env.ADMIN_EMAIL),
      supportSessionId: null,
      supportAccessMode: null,
      source: "legacy_bridge",
    };
  }

  const identity = await upsertIdentity({
    clerkUserId: session.userId,
    email,
    firstName: clerkUser?.firstName || null,
    lastName: clerkUser?.lastName || null,
    avatarUrl: clerkUser?.imageUrl || null,
  });
  if (identity.platformRole === "platform_admin") {
    const support = await resolveSupportSession(identity.id);
    if (support) {
      const role: MembershipRole = support.session.accessMode === "read_write" ? "admin" : "read_only";
      return {
        organization: support.organization,
        orgId: support.organization.id,
        identityId: identity.id,
        membershipId: null,
        clerkUserId: session.userId,
        clerkOrganizationId: session.orgId || null,
        email,
        role,
        permissions: permissionsForRole(role, []),
        isPlatformAdmin: true,
        supportSessionId: support.session.id,
        supportAccessMode: support.session.accessMode === "read_write" ? "read_write" : "read_only",
        source: "support_session",
      };
    }
  }
  let resolved = await resolveMembership(identity.id, session.orgId || null);
  let source: TenantContextSource = "membership";

  if (!resolved) {
    resolved = await acceptPendingInvitation({
      identityId: identity.id,
      email,
      clerkOrganizationId: session.orgId || null,
    });
  }

  if (!resolved) {
    resolved = await ensureLegacyMembership({ identityId: identity.id, email });
    source = "legacy_bridge";
  }

  const role = isMembershipRole(resolved.membership.role)
    ? resolved.membership.role
    : "read_only";
  await db
    .update(organizationMemberships)
    .set({ lastActiveAt: new Date(), updatedAt: new Date() })
    .where(eq(organizationMemberships.id, resolved.membership.id));

  return {
    organization: resolved.organization,
    orgId: resolved.organization.id,
    identityId: identity.id,
    membershipId: resolved.membership.id,
    clerkUserId: session.userId,
    clerkOrganizationId: session.orgId || null,
    email,
    role,
    permissions: permissionsForRole(role, resolved.membership.permissions),
    isPlatformAdmin: identity.platformRole === "platform_admin",
    supportSessionId: null,
    supportAccessMode: null,
    source,
  };
}

export const getTenantContext = cache(resolveTenantContextUncached);

export async function requireTenantContext() {
  return getTenantContext();
}

export async function requirePermission(permission: Permission) {
  const context = await requireTenantContext();
  if (!context.permissions.has(permission)) {
    throw new TenantAccessError(
      `Your role does not include ${permission}.`,
      403,
      "permission_denied",
    );
  }
  return context;
}

export function tenantErrorResponse(error: unknown) {
  if (error instanceof TenantAccessError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return null;
}
