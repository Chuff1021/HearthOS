import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { customers, db, properties, users } from "@/db";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { authorizeApi } from "@/lib/tenant/api-authorization";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Point = [number, number];

const MAPBOX_TOKEN =
  process.env.MAPBOX_SECRET_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  "";

function validPublicOrSecretToken(token: string) {
  return token.startsWith("sk.") || token.startsWith("pk.");
}

function hasAddress(c: {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}) {
  return Boolean(c.addressLine1 && (c.city || c.zip || c.state));
}

function formatAddress(c: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}) {
  return [c.addressLine1, c.addressLine2, c.city, c.state, c.zip].filter(Boolean).join(", ");
}

function normalizeState(value: string | null) {
  const text = String(value || "").trim();
  if (text.length === 2) return text.toUpperCase();
  const states: Record<string, string> = {
    missouri: "MO",
    arkansas: "AR",
    kansas: "KS",
    oklahoma: "OK",
    illinois: "IL",
    iowa: "IA",
    nebraska: "NE",
    texas: "TX",
  };
  return states[text.toLowerCase()] || text.slice(0, 2).toUpperCase();
}

function normalizeZip(value: string | null) {
  return String(value || "").trim().slice(0, 10) || "00000";
}

function normalizeCity(value: string | null) {
  return String(value || "").trim() || "Unknown";
}

function displayNameFor(c: {
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}) {
  return (
    c.companyName ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.email ||
    "Customer"
  );
}

async function geocodeAddress(address: string): Promise<{ center: Point; label: string } | null> {
  if (!MAPBOX_TOKEN || !validPublicOrSecretToken(MAPBOX_TOKEN)) return null;

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "us");
  url.searchParams.set("proximity", "-93.2923,37.2089");
  url.searchParams.set("access_token", MAPBOX_TOKEN);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  const feature = data?.features?.[0];
  const center = feature?.center;
  if (!Array.isArray(center) || center.length < 2) return null;

  return {
    center: [Number(center[1]), Number(center[0])],
    label: feature.place_name || address,
  };
}

async function requireAdmin() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return { ok: true as const };

  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadataRole = String(
    user.publicMetadata?.hearthRole ||
    user.privateMetadata?.hearthRole ||
    user.unsafeMetadata?.hearthRole ||
    ""
  ).toLowerCase();
  if (metadataRole === "admin" || metadataRole === "owner") return { ok: true as const };

  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const org = await getOrCreateDefaultOrg();
  const [row] = await db
    .select({ role: users.role, isOwner: users.isOwner })
    .from(users)
    .where(and(eq(users.orgId, org.id), eq(users.email, email)))
    .limit(1);

  if (row && (row.role === "admin" || row.isOwner)) return { ok: true as const };

  return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function POST(request: NextRequest) {
  const denied = await authorizeApi("customers:write");
  if (denied) return denied;
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return admin.response;

    if (!MAPBOX_TOKEN || !validPublicOrSecretToken(MAPBOX_TOKEN)) {
      return NextResponse.json({ error: "Mapbox token is not configured" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body?.limit || 100), 250));
    const requestedIds = Array.isArray(body?.customerIds)
      ? new Set(body.customerIds.map((id: unknown) => String(id)).filter(Boolean))
      : null;
    const org = await getOrCreateDefaultOrg();

    const [customerRows, propertyRows] = await Promise.all([
      db.select().from(customers).where(and(eq(customers.orgId, org.id), eq(customers.isActive, true))),
      db.select().from(properties).where(eq(properties.orgId, org.id)),
    ]);

    const propsByCustomer = new Map<string, typeof propertyRows[number][]>();
    for (const p of propertyRows) {
      const list = propsByCustomer.get(p.customerId) || [];
      list.push(p);
      propsByCustomer.set(p.customerId, list);
    }

    const needsAddress = customerRows.filter((c) => !hasAddress(c)).length;
    const candidates = customerRows
      .filter((customer) => !requestedIds || requestedIds.has(customer.id) || (customer.qbCustomerId && requestedIds.has(customer.qbCustomerId)))
      .filter(hasAddress)
      .map((customer) => {
        const existing = (propsByCustomer.get(customer.id) || []).sort((a, b) => {
          const aScore = (a.isPrimary ? 2 : 0) + (a.lat && a.lng ? 1 : 0);
          const bScore = (b.isPrimary ? 2 : 0) + (b.lat && b.lng ? 1 : 0);
          return bScore - aScore;
        })[0];
        return { customer, existing };
      })
      .filter(({ existing }) => !(existing?.lat && existing?.lng))
      .slice(0, limit);

    let created = 0;
    let updated = 0;
    let failed = 0;
    const results: Array<{ customerId: string; displayName: string; status: string; label?: string }> = [];

    for (const { customer, existing } of candidates) {
      const address = formatAddress(customer);
      const match = await geocodeAddress(address);
      const displayName = displayNameFor(customer);
      if (!match) {
        failed += 1;
        results.push({ customerId: customer.id, displayName, status: "failed" });
        continue;
      }

      const [lat, lng] = match.center;
      if (existing) {
        await db
          .update(properties)
          .set({
            lat: lat.toFixed(7),
            lng: lng.toFixed(7),
            isPrimary: existing.isPrimary ?? true,
            updatedAt: new Date(),
          })
          .where(eq(properties.id, existing.id));
        updated += 1;
        results.push({ customerId: customer.id, displayName, status: "updated", label: match.label });
      } else {
        await db.insert(properties).values({
          customerId: customer.id,
          orgId: org.id,
          nickname: "QuickBooks address",
          address: customer.addressLine1!,
          city: normalizeCity(customer.city),
          state: normalizeState(customer.state || "MO"),
          zip: normalizeZip(customer.zip),
          lat: lat.toFixed(7),
          lng: lng.toFixed(7),
          isPrimary: true,
        });
        created += 1;
        results.push({ customerId: customer.id, displayName, status: "created", label: match.label });
      }
    }

    const remaining = Math.max(0, customerRows.filter(hasAddress).length - propertyRows.filter((p) => p.lat && p.lng).length - created - updated);

    return NextResponse.json({
      processed: candidates.length,
      created,
      updated,
      failed,
      needsAddress,
      remaining,
      results,
    });
  } catch (err) {
    console.error("Service map geocode failed:", err);
    return NextResponse.json({ error: "Failed to geocode service map customers" }, { status: 500 });
  }
}
