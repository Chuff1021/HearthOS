import { clerkClient } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, organizationInvitations } from "@/db";
import { ensureClerkOrganization } from "@/lib/tenant/clerk-organization";
import { requirePermission, tenantErrorResponse } from "@/lib/tenant/context";
import { isMembershipRole, type MembershipRole } from "@/lib/tenant/permissions";

function normalizeRole(value: unknown): MembershipRole {
  const role = String(value || "").trim().toLowerCase();
  if (role === "tech") return "technician";
  return isMembershipRole(role) ? role : "read_only";
}

function invitationPayload(invitation: typeof organizationInvitations.$inferSelect) {
  return {
    id: invitation.id,
    email: invitation.email,
    name: invitation.name || "",
    role: invitation.role,
    status: invitation.status,
    createdAt: invitation.createdAt?.toISOString() || new Date().toISOString(),
    expiresAt: invitation.expiresAt?.toISOString() || null,
  };
}

export async function GET() {
  try {
    const context = await requirePermission("members:read");
    const invitations = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.orgId, context.orgId))
      .orderBy(desc(organizationInvitations.createdAt));
    return NextResponse.json({
      invitations: invitations.map(invitationPayload),
      total: invitations.length,
    });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json(
      { error: "Failed to load team invitations" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePermission("members:manage");
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const role = normalizeRole(body.role);
    if (!email || !name || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email and name are required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(organizationInvitations)
      .where(and(
        eq(organizationInvitations.orgId, context.orgId),
        eq(organizationInvitations.email, email),
        eq(organizationInvitations.status, "pending"),
      ))
      .limit(1);
    if (existing) {
      return NextResponse.json({ invitation: invitationPayload(existing) });
    }

    const clerkOrganizationId = await ensureClerkOrganization(context);
    const client = await clerkClient();
    const clerkInvitation = await client.organizations.createOrganizationInvitation({
      organizationId: clerkOrganizationId,
      emailAddress: email,
      role: "org:member",
      inviterUserId: context.clerkUserId || undefined,
      expiresInDays: 14,
      redirectUrl: new URL("/sign-up", request.url).toString(),
      publicMetadata: { hearthRole: role, name },
    });
    const [invitation] = await db
      .insert(organizationInvitations)
      .values({
        orgId: context.orgId,
        email,
        name,
        role,
        status: "pending",
        clerkInvitationId: clerkInvitation.id,
        invitedByIdentityId: context.identityId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      })
      .returning();

    return NextResponse.json({ invitation: invitationPayload(invitation) }, { status: 201 });
  } catch (error) {
    console.error("Team invitation failed:", error);
    return tenantErrorResponse(error) || NextResponse.json(
      { error: "Failed to send team invitation" },
      { status: 500 },
    );
  }
}
