import { clerkClient } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  authIdentities,
  db,
  organizationMemberships,
  organizations,
  users,
} from "@/db";

const PILOT_ORGANIZATION_SLUG = "lt-rush-stone";
const PILOT_ACCOUNTS = {
  LTRUSH: {
    email: "ltrush@demo.hearthos.app",
    firstName: "LT Rush",
    lastName: "Demo",
    externalId: "hearthos-demo-ltrush",
    employeeUserId: "72000000-0000-4000-8000-000000000001",
    membershipRole: "owner",
    clerkRole: "org:admin",
    destination: "/",
  },
  LTTECH: {
    email: "lttech@demo.hearthos.app",
    firstName: "Caleb",
    lastName: "Demo",
    externalId: "hearthos-demo-lttech",
    employeeUserId: "72000000-0000-4000-8000-000000000003",
    membershipRole: "technician",
    clerkRole: "org:member",
    destination: "/tech",
  },
} as const;

type PilotUsername = keyof typeof PILOT_ACCOUNTS;

function matches(candidate: string, expected: string) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const expectedPassword = process.env.PILOT_DEMO_PASSWORD || "";
  if (
    process.env.VERCEL_ENV !== "preview"
    || process.env.PILOT_TENANT_PROVISIONING_ENABLED !== "true"
    || !expectedPassword
  ) {
    return unavailable();
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const username = body.username?.trim().toUpperCase() as PilotUsername | undefined;
  const pilot = username ? PILOT_ACCOUNTS[username] : undefined;
  const passwordMatches = typeof body.password === "string" && matches(body.password, expectedPassword);
  if (!pilot || !passwordMatches) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const client = await clerkClient();
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, PILOT_ORGANIZATION_SLUG))
    .limit(1);
  if (!organization?.clerkOrganizationId) {
    return NextResponse.json({ error: "Demo workspace is not provisioned" }, { status: 503 });
  }

  const [employee] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, pilot.employeeUserId), eq(users.orgId, organization.id)))
    .limit(1);
  if (!employee) {
    return NextResponse.json({ error: "Demo team member is not provisioned" }, { status: 503 });
  }

  const existingUsers = await client.users.getUserList({ emailAddress: [pilot.email], limit: 2 });
  const user = existingUsers.data[0] || await client.users.createUser({
    emailAddress: [pilot.email],
    password: expectedPassword,
    firstName: pilot.firstName,
    lastName: pilot.lastName,
    externalId: pilot.externalId,
    skipPasswordChecks: true,
    skipLegalChecks: true,
    privateMetadata: { hearthosDemoUsername: username },
    unsafeMetadata: pilot.membershipRole === "technician" ? { techId: pilot.employeeUserId } : {},
  });

  await client.users.updateUser(user.id, {
    password: expectedPassword,
    skipPasswordChecks: true,
    firstName: pilot.firstName,
    lastName: pilot.lastName,
    privateMetadata: { ...user.privateMetadata, hearthosDemoUsername: username },
    unsafeMetadata: pilot.membershipRole === "technician"
      ? { ...user.unsafeMetadata, techId: pilot.employeeUserId }
      : user.unsafeMetadata,
    signOutOfOtherSessions: true,
    createOrganizationEnabled: false,
    createOrganizationsLimit: 0,
  });
  await client.users.disableUserMFA(user.id);

  const clerkMemberships = await client.organizations.getOrganizationMembershipList({
    organizationId: organization.clerkOrganizationId,
    userId: [user.id],
    limit: 10,
  });
  if (clerkMemberships.totalCount === 0) {
    await client.organizations.createOrganizationMembership({
      organizationId: organization.clerkOrganizationId,
      userId: user.id,
      role: pilot.clerkRole,
    });
  }

  await db.transaction(async (tx) => {
    const [identity] = await tx
      .insert(authIdentities)
      .values({
        clerkUserId: user.id,
        primaryEmail: pilot.email,
        firstName: pilot.firstName,
        lastName: pilot.lastName,
        platformRole: "none",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: authIdentities.clerkUserId,
        set: {
          primaryEmail: pilot.email,
          firstName: pilot.firstName,
          lastName: pilot.lastName,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx
      .insert(organizationMemberships)
      .values({
        orgId: organization.id,
        identityId: identity.id,
        employeeUserId: pilot.employeeUserId,
        role: pilot.membershipRole,
        status: "active",
        acceptedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [organizationMemberships.orgId, organizationMemberships.identityId],
        set: {
          employeeUserId: pilot.employeeUserId,
          role: pilot.membershipRole,
          status: "active",
          acceptedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  });

  const signInToken = await client.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: 60,
  });

  return NextResponse.json(
    { ticket: signInToken.token, destination: pilot.destination },
    { headers: { "Cache-Control": "no-store" } },
  );
}
