import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, customers, properties } from "@/db";
import { getOrCreateDefaultOrg } from "@/lib/org";

type PropertyRow = typeof properties.$inferSelect;

function addressFromCustomer(customer: typeof customers.$inferSelect, property?: PropertyRow) {
  const address = property
    ? {
        line1: property.address || undefined,
        line2: undefined,
        city: property.city || undefined,
        state: property.state || undefined,
        zip: property.zip || undefined,
      }
    : {
        line1: customer.addressLine1 || undefined,
        line2: customer.addressLine2 || undefined,
        city: customer.city || undefined,
        state: customer.state || undefined,
        zip: customer.zip || undefined,
      };

  const locality = [address.city, address.state].filter(Boolean).join(", ");
  const formatted = [address.line1, address.line2, locality, address.zip]
    .filter(Boolean)
    .join(" ")
    .trim();

  return { ...address, formatted };
}

function mapCustomer(customer: any) {
  return {
    id: customer.id || customer.qbCustomerId || customer.Id,
    displayName: customer.displayName || customer.name || customer.companyName || "",
    firstName: customer.firstName,
    lastName: customer.lastName,
    companyName: customer.companyName,
    phone: customer.phone || customer.primaryPhone || customer?.PrimaryPhone?.FreeFormNumber,
    email: customer.email,
    address: customer.address,
  };
}

function mapDbCustomer(customer: typeof customers.$inferSelect, property?: PropertyRow) {
  const displayName =
    customer.companyName ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    customer.email ||
    "Unnamed customer";

  return {
    id: customer.id,
    qbCustomerId: customer.qbCustomerId,
    displayName,
    firstName: customer.firstName,
    lastName: customer.lastName,
    companyName: customer.companyName,
    phone: customer.phone,
    email: customer.email,
    address: addressFromCustomer(customer, property),
  };
}

function searchTerm(term: string, orgId: string) {
  const like = `%${term}%`;
  return or(
    ilike(customers.firstName, like),
    ilike(customers.lastName, like),
    ilike(customers.companyName, like),
    ilike(customers.email, like),
    ilike(customers.phone, like),
    ilike(customers.addressLine1, like),
    ilike(customers.city, like),
    ilike(customers.zip, like),
    sql<boolean>`concat_ws(' ', ${customers.firstName}, ${customers.lastName}) ilike ${like}`,
    sql<boolean>`exists (
      select 1 from ${properties}
      where ${properties.customerId} = ${customers.id}
        and ${properties.orgId} = ${orgId}
        and concat_ws(' ', ${properties.address}, ${properties.city}, ${properties.state}, ${properties.zip}) ilike ${like}
    )`,
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const live = searchParams.get("live") === "true";

  if (q.length < 2) {
    return NextResponse.json({ customers: [], total: 0, source: "none" });
  }

  try {
    const org = await getOrCreateDefaultOrg();
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
    const rows = await db
      .select()
      .from(customers)
      .where(and(
        eq(customers.orgId, org.id),
        eq(customers.isActive, true),
        ...terms.map((term) => searchTerm(term, org.id)),
      ))
      .orderBy(customers.lastName, customers.firstName, customers.companyName)
      .limit(12);

    if (rows.length > 0) {
      const propertyRows = await db
        .select()
        .from(properties)
        .where(and(
          eq(properties.orgId, org.id),
          inArray(properties.customerId, rows.map((row) => row.id)),
        ))
        .orderBy(desc(properties.isPrimary), desc(properties.updatedAt));
      const primaryPropertyByCustomer = new Map<string, PropertyRow>();
      for (const property of propertyRows) {
        if (!primaryPropertyByCustomer.has(property.customerId)) {
          primaryPropertyByCustomer.set(property.customerId, property);
        }
      }

      return NextResponse.json({
        customers: rows.map((row) => mapDbCustomer(row, primaryPropertyByCustomer.get(row.id))),
        total: rows.length,
        source: "hearth-customers",
      });
    }
  } catch (error) {
    console.warn("Fast customer lookup failed, trying legacy local store:", error);
  }

  try {
    const localRes = await fetch(`${origin}/api/customers?q=${encodeURIComponent(q)}`, {
      headers: { cookie: request.headers.get("cookie") || "" },
      cache: "no-store",
    });
    const localData = await localRes.json().catch(() => ({}));
    if (localRes.ok && Array.isArray(localData.customers) && localData.customers.length > 0) {
      return NextResponse.json({
        customers: localData.customers.map(mapCustomer),
        total: localData.customers.length,
        source: "local",
      });
    }
  } catch {}

  if (live) {
    try {
      const liveRes = await fetch(`${origin}/api/quickbooks/customers?q=${encodeURIComponent(q)}&live=true`, {
        headers: { cookie: request.headers.get("cookie") || "" },
        cache: "no-store",
      });
      const liveData = await liveRes.json().catch(() => ({}));
      if (liveRes.ok && Array.isArray(liveData.customers)) {
        return NextResponse.json({
          customers: liveData.customers.map(mapCustomer),
          total: liveData.customers.length,
          source: "quickbooks-live",
        });
      }
    } catch {}
  }

  return NextResponse.json({ customers: [], total: 0, source: "none" });
}
