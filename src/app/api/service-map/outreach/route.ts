import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { customers, db } from "@/db";
import { isClerkConfigured } from "@/lib/auth";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { authorizeApi } from "@/lib/tenant/api-authorization";
import {
  createServiceOutreach,
  listServiceOutreachForCustomer,
  normalizeOutreachOutcome,
} from "@/lib/service-map-outreach-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireInternalUser() {
  if (!isClerkConfigured()) return { ok: true as const, userId: "local" };

  const { userId } = await auth();
  if (userId) return { ok: true as const, userId };

  return {
    ok: false as const,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

function cleanDate(value: unknown) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export async function GET(request: NextRequest) {
  const denied = await authorizeApi("customers:read");
  if (denied) return denied;
  try {
    const access = await requireInternalUser();
    if (!access.ok) return access.response;

    const org = await getOrCreateDefaultOrg();
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

    const records = await listServiceOutreachForCustomer(org.id, customerId);
    return NextResponse.json({ records, latest: records[0] || null });
  } catch (err) {
    console.error("Service outreach GET failed:", err);
    return NextResponse.json({ error: "Failed to load outreach records" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await authorizeApi("customers:write");
  if (denied) return denied;
  try {
    const access = await requireInternalUser();
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const customerId = String(body?.customerId || "").trim();
    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

    const org = await getOrCreateDefaultOrg();
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.orgId, org.id), eq(customers.id, customerId)))
      .limit(1);

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const record = await createServiceOutreach({
      orgId: org.id,
      customerId,
      outcome: normalizeOutreachOutcome(body?.outcome),
      contactDate: cleanDate(body?.contactDate) || new Date().toISOString().slice(0, 10),
      note: body?.note ? String(body.note).slice(0, 2000) : null,
      needsFollowUp: Boolean(body?.needsFollowUp),
      followUpDate: cleanDate(body?.followUpDate),
      createdBy: access.userId,
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (err) {
    console.error("Service outreach POST failed:", err);
    return NextResponse.json({ error: "Failed to save outreach record" }, { status: 500 });
  }
}
