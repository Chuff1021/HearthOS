import { authorizeCrmApi, requireCrmActor } from "@/lib/security/crm-access";
import { NextRequest, NextResponse } from "next/server";
import { db, customers } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { customerAddress, customerSearchPredicate } from "@/lib/customer-search";

export async function GET(request: NextRequest) {
  const accessDenied = await authorizeCrmApi("/api/customer-lookup", "GET");
  if (accessDenied) return accessDenied;
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < 2) return NextResponse.json({ customers: [], total: 0, source: "database" });
  try {
    const actor = await requireCrmActor();
    const rows = await db.select().from(customers)
      .where(and(eq(customers.orgId, actor.orgId), eq(customers.isActive, true), customerSearchPredicate(query)))
      .orderBy(asc(customers.lastName), asc(customers.firstName), asc(customers.id)).limit(30);
    const results = rows.map((customer) => ({
      id: customer.qbCustomerId || customer.id,
      localId: customer.id,
      qbCustomerId: customer.qbCustomerId,
      displayName: customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || "Unnamed",
      phone: customer.phone || customer.phoneAlt || "",
      email: customer.email || "",
      address: customerAddress(customer),
    }));
    return NextResponse.json({ customers: results, total: results.length, source: "database" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Customer search is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
