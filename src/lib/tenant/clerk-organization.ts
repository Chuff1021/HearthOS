import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, organizations } from "@/db";
import type { TenantContext } from "@/lib/tenant/context";

export async function ensureClerkOrganization(context: TenantContext) {
  if (context.organization.clerkOrganizationId) {
    return context.organization.clerkOrganizationId;
  }
  if (!context.clerkUserId) {
    throw new Error("A Clerk user is required to create the company workspace.");
  }

  const client = await clerkClient();
  const clerkOrganization = await client.organizations.createOrganization({
    name: context.organization.name,
    createdBy: context.clerkUserId,
  });
  const [updated] = await db
    .update(organizations)
    .set({ clerkOrganizationId: clerkOrganization.id, updatedAt: new Date() })
    .where(and(
      eq(organizations.id, context.orgId),
      isNull(organizations.clerkOrganizationId),
    ))
    .returning({ clerkOrganizationId: organizations.clerkOrganizationId });

  if (updated?.clerkOrganizationId) return updated.clerkOrganizationId;
  const [existing] = await db
    .select({ clerkOrganizationId: organizations.clerkOrganizationId })
    .from(organizations)
    .where(eq(organizations.id, context.orgId))
    .limit(1);
  return existing?.clerkOrganizationId || clerkOrganization.id;
}

