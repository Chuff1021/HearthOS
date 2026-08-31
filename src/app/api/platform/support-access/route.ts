import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auditLogs, db, organizations, supportAccessSessions } from "@/db";
import {
  requirePermission,
  requireTenantContext,
  tenantErrorResponse,
} from "@/lib/tenant/context";

const MAX_SESSION_MINUTES = 120;

async function audit(input: {
  orgId: string;
  identityId: string | null;
  sessionId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    orgId: input.orgId,
    actorIdentityId: input.identityId,
    supportSessionId: input.sessionId,
    action: input.action,
    entityType: "support_access_session",
    entityId: input.sessionId,
    metadata: input.metadata || {},
  });
}

export async function GET() {
  try {
    const context = await requireTenantContext();
    const sessions = context.isPlatformAdmin
      ? await db
          .select({ session: supportAccessSessions, organization: organizations })
          .from(supportAccessSessions)
          .innerJoin(organizations, eq(supportAccessSessions.orgId, organizations.id))
          .where(eq(supportAccessSessions.actorIdentityId, context.identityId!))
          .orderBy(desc(supportAccessSessions.createdAt))
          .limit(100)
      : await db
          .select({ session: supportAccessSessions, organization: organizations })
          .from(supportAccessSessions)
          .innerJoin(organizations, eq(supportAccessSessions.orgId, organizations.id))
          .where(eq(supportAccessSessions.orgId, context.orgId))
          .orderBy(desc(supportAccessSessions.createdAt))
          .limit(100);
    return NextResponse.json({
      organizations: context.isPlatformAdmin
        ? await db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug }).from(organizations).orderBy(organizations.name)
        : [],
      sessions: sessions.map(({ session, organization }) => ({
        id: session.id,
        organization: { id: organization.id, name: organization.name },
        reason: session.reason,
        accessMode: session.accessMode,
        status: session.status,
        startsAt: session.startsAt,
        expiresAt: session.expiresAt,
        endedAt: session.endedAt,
        createdAt: session.createdAt,
      })),
    });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to load support sessions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    if (!context.isPlatformAdmin || !context.identityId) {
      return NextResponse.json({ error: "Platform administrator access required" }, { status: 403 });
    }
    const body = await request.json();
    const orgId = String(body.orgId || "");
    const reason = String(body.reason || "").trim().slice(0, 1000);
    const accessMode = body.accessMode === "read_write" ? "read_write" : "read_only";
    const minutes = Math.max(15, Math.min(Number(body.minutes || 60), MAX_SESSION_MINUTES));
    if (!orgId || reason.length < 10) {
      return NextResponse.json({ error: "Company and a specific support reason are required" }, { status: 400 });
    }
    const [organization] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!organization) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const [session] = await db
      .insert(supportAccessSessions)
      .values({
        orgId,
        actorIdentityId: context.identityId,
        reason,
        accessMode,
        status: "pending",
        expiresAt: new Date(Date.now() + minutes * 60 * 1000),
      })
      .returning();
    await audit({ orgId, identityId: context.identityId, sessionId: session.id, action: "support_access_requested", metadata: { accessMode, minutes } });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to request support access" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const body = await request.json();
    const sessionId = String(body.sessionId || "");
    const action = String(body.action || "");
    const [session] = await db
      .select()
      .from(supportAccessSessions)
      .where(and(
        eq(supportAccessSessions.id, sessionId),
        inArray(supportAccessSessions.status, ["pending", "approved", "active"]),
        gt(supportAccessSessions.expiresAt, new Date()),
      ))
      .limit(1);
    if (!session) return NextResponse.json({ error: "Support session not found or expired" }, { status: 404 });

    if (action === "approve") {
      await requirePermission("organization:manage");
      if (context.orgId !== session.orgId || !context.identityId) {
        return NextResponse.json({ error: "Only this company's owner or admin can approve access" }, { status: 403 });
      }
      if (context.identityId === session.actorIdentityId) {
        return NextResponse.json({ error: "Support access must be approved by a different company administrator" }, { status: 403 });
      }
      await db
        .update(supportAccessSessions)
        .set({ status: "approved", approvedByIdentityId: context.identityId })
        .where(eq(supportAccessSessions.id, session.id));
      await audit({ orgId: session.orgId, identityId: context.identityId, sessionId: session.id, action: "support_access_approved" });
      return NextResponse.json({ ok: true, status: "approved" });
    }

    if (action === "activate") {
      if (!context.isPlatformAdmin || context.identityId !== session.actorIdentityId || session.status !== "approved") {
        return NextResponse.json({ error: "Approved platform support access is required" }, { status: 403 });
      }
      await db.update(supportAccessSessions).set({ status: "active", startsAt: new Date() }).where(eq(supportAccessSessions.id, session.id));
      await audit({ orgId: session.orgId, identityId: context.identityId, sessionId: session.id, action: "support_access_activated" });
      const response = NextResponse.json({ ok: true, status: "active" });
      response.cookies.set("hearthos_support_session", session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: session.expiresAt,
        path: "/",
      });
      return response;
    }

    if (action === "end") {
      const canEnd = context.identityId === session.actorIdentityId || context.orgId === session.orgId;
      if (!canEnd) return NextResponse.json({ error: "You cannot end this support session" }, { status: 403 });
      await db.update(supportAccessSessions).set({ status: "ended", endedAt: new Date() }).where(eq(supportAccessSessions.id, session.id));
      await audit({ orgId: session.orgId, identityId: context.identityId, sessionId: session.id, action: "support_access_ended" });
      const response = NextResponse.json({ ok: true, status: "ended" });
      response.cookies.delete("hearthos_support_session");
      return response;
    }

    return NextResponse.json({ error: "Unsupported support action" }, { status: 400 });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to update support access" }, { status: 500 });
  }
}
