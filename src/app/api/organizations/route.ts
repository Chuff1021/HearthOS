import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  onboardingProgress,
  organizationMemberships,
  organizations,
} from "@/db";
import {
  requireAuthenticatedIdentity,
  requireTenantContext,
  tenantErrorResponse,
} from "@/lib/tenant/context";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "company";
}

export async function GET() {
  try {
    const context = await requireTenantContext();
    if (!context.identityId) {
      return NextResponse.json({ organizations: [{
        id: context.orgId,
        name: context.organization.name,
        slug: context.organization.slug,
        role: context.role,
        active: true,
      }] });
    }
    const rows = await db
      .select({ organization: organizations, membership: organizationMemberships })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.orgId, organizations.id))
      .where(eq(organizationMemberships.identityId, context.identityId));
    return NextResponse.json({
      organizations: rows
        .filter((row) => row.membership.status === "active")
        .map((row) => ({
          id: row.organization.id,
          clerkOrganizationId: row.organization.clerkOrganizationId,
          name: row.organization.name,
          slug: row.organization.slug,
          logoUrl: row.organization.logoUrl,
          role: row.membership.role,
          active: row.organization.id === context.orgId,
        })),
    });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to load companies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let clerkOrganizationId: string | null = null;
  try {
    const { identity, clerkUserId } = await requireAuthenticatedIdentity();
    const body = await request.json();
    const name = String(body.name || "").trim().slice(0, 150);
    if (name.length < 2) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const client = await clerkClient();
    const clerkOrganization = await client.organizations.createOrganization({
      name,
      createdBy: clerkUserId,
    });
    clerkOrganizationId = clerkOrganization.id;
    const baseSlug = slugify(name);
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;

    const result = await db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(organizations)
        .values({
          name,
          slug,
          clerkOrganizationId,
          onboardingStatus: "in_progress",
          subscriptionTier: "starter",
          timezone: String(body.timezone || "America/Chicago"),
          settings: {
            brandPrimary: "#ff5a1f",
            scheduling: {},
            company: {},
          },
        })
        .returning();
      const [membership] = await tx
        .insert(organizationMemberships)
        .values({
          orgId: organization.id,
          identityId: identity.id,
          role: "owner",
          status: "active",
          acceptedAt: new Date(),
          lastActiveAt: new Date(),
        })
        .returning();
      await tx.insert(onboardingProgress).values({
        orgId: organization.id,
        status: "in_progress",
        currentStep: "company",
        completedSteps: [],
        checklist: {},
        startedAt: new Date(),
      });
      return { organization, membership };
    });

    return NextResponse.json({
      organization: {
        id: result.organization.id,
        clerkOrganizationId: result.organization.clerkOrganizationId,
        name: result.organization.name,
        slug: result.organization.slug,
      },
      membership: { id: result.membership.id, role: result.membership.role },
    }, { status: 201 });
  } catch (error) {
    if (clerkOrganizationId) {
      try {
        const client = await clerkClient();
        await client.organizations.deleteOrganization(clerkOrganizationId);
      } catch (cleanupError) {
        console.error("Failed to clean up Clerk organization:", cleanupError);
      }
    }
    console.error("Organization creation failed:", error);
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }
}
