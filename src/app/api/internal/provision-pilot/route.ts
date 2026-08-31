import { clerkClient } from "@clerk/nextjs/server";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  authIdentities,
  db,
  onboardingProgress,
  organizationMemberships,
  organizations,
} from "@/db";

const PILOT = {
  username: "LTRUSH",
  email: "ltrush@demo.hearthos.app",
  organizationName: "L.T. Rush Stone Inc",
  organizationSlug: "lt-rush-stone",
} as const;

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function secretMatches(candidate: string, expected: string) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function provisioningError(error: unknown) {
  const value = error as {
    status?: number;
    errors?: Array<{ code?: string; longMessage?: string; message?: string }>;
  };
  const details = (value.errors || []).map((item) => ({
    code: item.code || "unknown",
    message: item.longMessage || item.message || "Provisioning failed",
  }));
  console.error("Pilot provisioning failed", { status: value.status, details });
  return NextResponse.json(
    { error: "Pilot provisioning failed", details },
    { status: value.status && value.status >= 400 && value.status < 600 ? value.status : 500 },
  );
}

export async function POST(request: NextRequest) {
  const expectedSecret = (process.env.PILOT_TENANT_PROVISIONING_SECRET || "").trim();
  const provisionSecret = request.headers.get("x-hearthos-provision-secret") || "";
  if (
    process.env.VERCEL_ENV !== "preview"
    || process.env.PILOT_TENANT_PROVISIONING_ENABLED !== "true"
    || !expectedSecret
    || !secretMatches(provisionSecret, expectedSecret)
  ) {
    return unavailable();
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.username?.trim().toUpperCase() !== PILOT.username || !body.password) {
    return NextResponse.json({ error: "Invalid pilot credentials" }, { status: 400 });
  }

  try {
  const client = await clerkClient();
  const existingUsers = await client.users.getUserList({ emailAddress: [PILOT.email], limit: 2 });
  const clerkUser = existingUsers.data[0] || await client.users.createUser({
    emailAddress: [PILOT.email],
    phoneNumber: ["+12025550195"],
    password: body.password,
    firstName: "LT Rush",
    lastName: "Demo",
    externalId: "hearthos-demo-ltrush",
    privateMetadata: { hearthosDemoUsername: PILOT.username },
  });
  if (existingUsers.data[0]) {
    await client.users.updateUser(clerkUser.id, {
      password: body.password,
      firstName: "LT Rush",
      lastName: "Demo",
      privateMetadata: { hearthosDemoUsername: PILOT.username },
      signOutOfOtherSessions: true,
    });
  }

  await client.instance.updateOrganizationSettings({
    enabled: true,
    maxAllowedMemberships: 20,
    adminDeleteEnabled: false,
  });

  const existingOrganizations = await client.organizations.getOrganizationList({
    query: PILOT.organizationName,
    limit: 20,
  });
  const clerkOrganization = existingOrganizations.data.find(
    (organization) => organization.slug === PILOT.organizationSlug,
  ) || await client.organizations.createOrganization({
    name: PILOT.organizationName,
    slug: PILOT.organizationSlug,
    privateMetadata: { hearthosPilot: true, demoData: true },
  });

  const clerkMemberships = await client.organizations.getOrganizationMembershipList({
    organizationId: clerkOrganization.id,
    userId: [clerkUser.id],
    limit: 10,
  });
  if (clerkMemberships.totalCount === 0) {
    await client.organizations.createOrganizationMembership({
      organizationId: clerkOrganization.id,
      userId: clerkUser.id,
      role: "org:admin",
    });
  }

  const result = await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({
        name: PILOT.organizationName,
        slug: PILOT.organizationSlug,
        email: PILOT.email,
        phone: "717-765-6941",
        address: "4493 Buchanan Trail E, Waynesboro, PA 17268",
        timezone: "America/New_York",
        subscriptionTier: "pilot",
        clerkOrganizationId: clerkOrganization.id,
        onboardingStatus: "active",
        settings: {
          brandPrimary: "#9c3d2b",
          brandSecondary: "#27352d",
          company: { name: PILOT.organizationName, demoData: true },
          scheduling: { dayStart: "08:00", dayEnd: "17:00", defaultDuration: "120" },
        },
      })
      .onConflictDoUpdate({
        target: organizations.slug,
        set: {
          name: PILOT.organizationName,
          clerkOrganizationId: clerkOrganization.id,
          onboardingStatus: "active",
          updatedAt: new Date(),
        },
      })
      .returning();

    const [identity] = await tx
      .insert(authIdentities)
      .values({
        clerkUserId: clerkUser.id,
        primaryEmail: PILOT.email,
        firstName: "LT Rush",
        lastName: "Demo",
        platformRole: "none",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: authIdentities.clerkUserId,
        set: {
          primaryEmail: PILOT.email,
          firstName: "LT Rush",
          lastName: "Demo",
          platformRole: "none",
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
        role: "owner",
        status: "active",
        acceptedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [organizationMemberships.orgId, organizationMemberships.identityId],
        set: { role: "owner", status: "active", acceptedAt: new Date(), updatedAt: new Date() },
      });

    await tx
      .insert(onboardingProgress)
      .values({
        orgId: organization.id,
        status: "completed",
        currentStep: "complete",
        completedSteps: ["company", "team", "scheduling"],
        checklist: { demoData: true, integrationsSkipped: true },
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: onboardingProgress.orgId,
        set: { status: "completed", currentStep: "complete", completedAt: new Date(), updatedAt: new Date() },
      });

    return { organization, identity };
  });

  return NextResponse.json({
    provisioned: true,
    organization: { id: result.organization.id, slug: result.organization.slug },
    identity: { id: result.identity.id, username: PILOT.username },
  });
  } catch (error) {
    return provisioningError(error);
  }
}
