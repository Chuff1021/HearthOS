import { NextRequest, NextResponse } from "next/server";
import { getJobs as getJobsFromApi } from "../jobs/route";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { customers, db, invoices } from "@/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { authorizeApi } from "@/lib/tenant/api-authorization";

function normalizeSearchValue(value: string | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearchQuery(query: string, field: string | undefined) {
  const normalizedField = normalizeSearchValue(field);
  if (!query) return true;
  if (normalizedField.includes(query)) return true;
  const queryTokens = query.split(" ").filter(Boolean);
  return queryTokens.every((token) => normalizedField.includes(token));
}

export async function GET(request: NextRequest) {
  const denied = await authorizeApi("organization:read");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") || "";
  const query = normalizeSearchValue(rawQuery);

  if (!query || query.length < 2) {
    return NextResponse.json({ customers: [], jobs: [], invoices: [] });
  }

  const org = await getOrCreateDefaultOrg();
  const like = `%${rawQuery.trim()}%`;

  const customerRows = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.orgId, org.id),
        or(
          ilike(customers.firstName, like),
          ilike(customers.lastName, like),
          ilike(customers.companyName, like),
          ilike(customers.email, like),
          ilike(customers.phone, like),
          ilike(sql<string>`coalesce(${customers.firstName}, '') || ' ' || coalesce(${customers.lastName}, '')`, like),
        )!,
      ),
    )
    .limit(8);

  const matchedCustomers = customerRows.map((c) => {
    const title = c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email || "Customer";
    return {
      id: c.qbCustomerId || c.id,
      type: "customer" as const,
      title,
      subtitle: c.companyName || c.email || c.phone || "No details",
      href: `/customers?id=${c.qbCustomerId || c.id}`,
      source: "local",
    };
  });

  // Search local jobs
  const jobs = await getJobsFromApi();
  const matchedJobs = jobs
    .filter(
      (j) =>
        j.jobNumber.toLowerCase().includes(query) ||
        j.title.toLowerCase().includes(query) ||
        j.customerName.toLowerCase().includes(query) ||
        j.propertyAddress.toLowerCase().includes(query)
    )
    .slice(0, 5)
    .map((j) => ({
      id: j.id,
      type: "job" as const,
      title: j.title,
      subtitle: `${j.jobNumber} • ${j.customerName}`,
      href: `/jobs?id=${j.id}`,
      source: "local",
    }));

  const invoiceRows = await db
    .select({
      invoice: invoices,
      customerFirst: customers.firstName,
      customerLast: customers.lastName,
      customerCompany: customers.companyName,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        eq(invoices.orgId, org.id),
        or(
          ilike(invoices.invoiceNumber, like),
          ilike(invoices.notes, like),
          ilike(customers.firstName, like),
          ilike(customers.lastName, like),
          ilike(customers.companyName, like),
          ilike(sql<string>`coalesce(${customers.firstName}, '') || ' ' || coalesce(${customers.lastName}, '')`, like),
        )!,
      ),
    )
    .orderBy(desc(invoices.issueDate), desc(invoices.updatedAt))
    .limit(8);

  const matchedInvoices = invoiceRows.map((row) => {
    const invoice = row.invoice;
    const customerName = row.customerCompany || [row.customerFirst, row.customerLast].filter(Boolean).join(" ").trim() || "Unknown";
    return {
      id: invoice.qbInvoiceId || invoice.id,
      type: "invoice" as const,
      title: invoice.invoiceNumber,
      subtitle: `${customerName} • $${Number(invoice.totalAmount || 0).toFixed(2)}`,
      href: `/invoices?id=${invoice.qbInvoiceId || invoice.id}`,
      source: "local",
    };
  });

  return NextResponse.json({
    customers: matchedCustomers.slice(0, 10),
    jobs: matchedJobs.slice(0, 10),
    invoices: matchedInvoices.slice(0, 10),
  });
}
