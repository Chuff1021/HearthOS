import { authorizeCrmApi } from "@/lib/security/crm-access";
import { NextRequest, NextResponse } from "next/server";
import { getJobs as getJobsFromApi } from "../jobs/route";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { customers, db, invoices } from "@/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { customerAddress, customerSearchPredicate } from "@/lib/customer-search";

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
  try {
    const accessDenied = await authorizeCrmApi("/api/search", "GET");
    if (accessDenied) {
      accessDenied.headers.set("Cache-Control", "private, no-store");
      return accessDenied;
    }
    return await search(request);
  } catch {
    return searchResponse({ error: "Search is temporarily unavailable. Please try again." }, 500);
  }
}

function searchResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function search(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get("q") || "").trim().slice(0, 160);
  const query = normalizeSearchValue(rawQuery);

  if (!query || query.length < 2) {
    return searchResponse({ customers: [], jobs: [], invoices: [] });
  }

  const org = await getOrCreateDefaultOrg();
  const like = `%${rawQuery.replace(/[\\%_]/g, "\\$&")}%`;

  // Independent reads share the authorized organization and retain their result caps.
  const [customerRows, jobs, invoiceRows] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.orgId, org.id),
          customerSearchPredicate(rawQuery),
        ),
      )
      .limit(8),
    getJobsFromApi(),
    db
      .select({
        invoice: invoices,
        customerFirst: customers.firstName,
        customerLast: customers.lastName,
        customerCompany: customers.companyName,
      })
      .from(invoices)
      .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.orgId, org.id)))
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
      .limit(8),
  ]);

  const matchedCustomers = customerRows.map((c) => {
    const title = c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email || "Customer";
    const address = customerAddress(c);
    const location = [address.line1, address.line2, address.city, address.state, address.zip].filter(Boolean).join(", ");
    const contactName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    return {
      id: c.id,
      type: "customer" as const,
      title,
      subtitle: [contactName !== title ? contactName : "", location, c.email || c.phone].filter(Boolean).join(" • ") || "No details",
      href: `/customers/${encodeURIComponent(c.id)}`,
      source: "local",
    };
  });

  // Search local jobs
  const matchedJobs = jobs
    .filter(
      (j) =>
        matchesSearchQuery(query, [j.jobNumber, j.title, j.customerName, j.propertyAddress].join(" "))
    )
    .slice(0, 5)
    .map((j) => ({
      id: j.id,
      type: "job" as const,
      title: j.title,
      subtitle: `${j.jobNumber} • ${j.customerName}`,
      href: `/jobs?id=${encodeURIComponent(j.id)}`,
      source: "local",
    }));

  const matchedInvoices = invoiceRows.map((row) => {
    const invoice = row.invoice;
    const customerName = row.customerCompany || [row.customerFirst, row.customerLast].filter(Boolean).join(" ").trim() || "Unknown";
    return {
      id: invoice.qbInvoiceId || invoice.id,
      type: "invoice" as const,
      title: invoice.invoiceNumber,
      subtitle: `${customerName} • $${Number(invoice.totalAmount || 0).toFixed(2)}`,
      href: `/invoices?id=${encodeURIComponent(invoice.qbInvoiceId || invoice.id)}`,
      source: "local",
    };
  });

  return searchResponse({
    customers: matchedCustomers.slice(0, 10),
    jobs: matchedJobs.slice(0, 10),
    invoices: matchedInvoices.slice(0, 10),
  });
}
