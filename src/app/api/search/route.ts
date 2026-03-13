import { NextRequest, NextResponse } from "next/server";
import { getCustomers, getInvoices } from "@/lib/data-store";
import { getJobs as getJobsFromApi } from "../jobs/route";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";
import {
  searchCustomers as searchQBCustomers,
  searchInvoices as searchQBInvoices,
  getClientFromTokens,
  syncCustomers,
  syncInvoices,
} from "@/lib/quickbooks";

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
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") || "";
  const query = normalizeSearchValue(rawQuery);

  if (!query || query.length < 2) {
    return NextResponse.json({ customers: [], jobs: [], invoices: [] });
  }

  // Search local customers
  const customers = getCustomers();
  const matchedCustomers = customers
    .filter(
      (c) =>
        c.displayName.toLowerCase().includes(query) ||
        c.firstName.toLowerCase().includes(query) ||
        c.lastName.toLowerCase().includes(query) ||
        c.companyName?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.phone?.includes(query)
    )
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      type: "customer" as const,
      title: c.displayName,
      subtitle: c.companyName || c.email || c.phone || "No details",
      href: `/customers?id=${c.id}`,
      source: "local",
    }));

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

  // Search local invoices
  const localInvoices = getInvoices();
  const matchedInvoices = localInvoices
    .filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(query) ||
        i.customerName.toLowerCase().includes(query) ||
        i.jobTitle.toLowerCase().includes(query)
    )
    .slice(0, 5)
    .map((i) => ({
      id: i.id,
      type: "invoice" as const,
      title: i.invoiceNumber,
      subtitle: `${i.customerName} • $${i.totalAmount.toFixed(2)}`,
      href: `/invoices?id=${i.id}`,
      source: "local",
    }));

  // Check for QuickBooks connection
  let accessToken = request.cookies.get("qb_access_token")?.value;
  let refreshToken = request.cookies.get("qb_refresh_token")?.value;
  let realmId = request.cookies.get("qb_realm_id")?.value;

  let qbConnected = !!(accessToken && refreshToken && realmId);
  let orgIdForQB: string | null = null;

  // If no cookies, check org tokens
  if (!qbConnected) {
    try {
      const org = await getOrCreateDefaultOrg();
      orgIdForQB = org.id;
      if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
        accessToken = org.qbAccessToken;
        refreshToken = org.qbRefreshToken;
        realmId = org.qbRealmId;
        qbConnected = true;
      }
    } catch {
      qbConnected = false;
    }
  } else {
    try {
      const org = await getOrCreateDefaultOrg();
      orgIdForQB = org.id;
    } catch {
      orgIdForQB = null;
    }
  }

  // If QuickBooks is connected, search QB data (API fetch + filter)
  if (qbConnected && accessToken && refreshToken && realmId) {
    const client = getClientFromTokens(accessToken, refreshToken, realmId);

    let qbMatchedCustomers: Array<{ id: string; type: "customer"; title: string; subtitle: string; href: string; source: "quickbooks" }> = [];
    let qbMatchedInvoices: Array<{ id: string; type: "invoice"; title: string; subtitle: string; href: string; source: "quickbooks" }> = [];

    try {
      // Pull fresh QB data directly and filter in-memory (more reliable than LIKE query edge cases)
      const [liveCustomers, liveInvoices] = await Promise.all([
        client.getAllCustomers(),
        client.getInvoices(500),
      ]);

        qbMatchedCustomers = liveCustomers
        .filter((c) =>
          matchesSearchQuery(query, c.DisplayName) ||
          matchesSearchQuery(query, c.CompanyName) ||
          matchesSearchQuery(query, c.PrimaryEmailAddr?.Address) ||
          matchesSearchQuery(query, c.PrimaryPhone?.FreeFormNumber)
        )
        .slice(0, 8)
        .map((c) => ({
          id: c.Id,
          type: "customer" as const,
          title: c.DisplayName,
          subtitle: c.CompanyName || c.PrimaryEmailAddr?.Address || c.PrimaryPhone?.FreeFormNumber || "QuickBooks customer",
          href: `/customers?id=${c.Id}`,
          source: "quickbooks" as const,
        }));

      qbMatchedInvoices = liveInvoices
        .filter((i) =>
          i.DocNumber?.toLowerCase().includes(query) ||
          i.CustomerRef?.name?.toLowerCase().includes(query) ||
          String(i.TotalAmt || "").includes(query)
        )
        .slice(0, 8)
        .map((i) => ({
          id: i.Id,
          type: "invoice" as const,
          title: i.DocNumber || `Invoice ${i.Id}`,
          subtitle: `${i.CustomerRef?.name || "Unknown"} • $${Number(i.TotalAmt || 0).toFixed(2)}`,
          href: `/invoices?id=${i.Id}`,
          source: "quickbooks" as const,
        }));
    } catch (liveErr) {
      console.error("QB direct search failed, attempting refresh:", liveErr);

      let refreshedClient = client;
      try {
        const newTokens = await client.refreshAccessToken();
        if (orgIdForQB) {
          await db
            .update(organizations)
            .set({
              qbAccessToken: newTokens.access_token,
              qbRefreshToken: newTokens.refresh_token,
              qbTokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
              updatedAt: new Date(),
            })
            .where(eq(organizations.id, orgIdForQB));
        }
        refreshedClient = getClientFromTokens(newTokens.access_token, newTokens.refresh_token, realmId);

        const [liveCustomersRetry, liveInvoicesRetry] = await Promise.all([
          refreshedClient.getAllCustomers(),
          refreshedClient.getInvoices(500),
        ]);

        qbMatchedCustomers = liveCustomersRetry
          .filter((c) =>
            matchesSearchQuery(query, c.DisplayName) ||
            matchesSearchQuery(query, c.CompanyName) ||
            matchesSearchQuery(query, c.PrimaryEmailAddr?.Address) ||
            matchesSearchQuery(query, c.PrimaryPhone?.FreeFormNumber)
          )
          .slice(0, 8)
          .map((c) => ({
            id: c.Id,
            type: "customer" as const,
            title: c.DisplayName,
            subtitle: c.CompanyName || c.PrimaryEmailAddr?.Address || c.PrimaryPhone?.FreeFormNumber || "QuickBooks customer",
            href: `/customers?id=${c.Id}`,
            source: "quickbooks" as const,
          }));

        qbMatchedInvoices = liveInvoicesRetry
          .filter((i) =>
            i.DocNumber?.toLowerCase().includes(query) ||
            i.CustomerRef?.name?.toLowerCase().includes(query) ||
            String(i.TotalAmt || "").includes(query)
          )
          .slice(0, 8)
          .map((i) => ({
            id: i.Id,
            type: "invoice" as const,
            title: i.DocNumber || `Invoice ${i.Id}`,
            subtitle: `${i.CustomerRef?.name || "Unknown"} • $${Number(i.TotalAmt || 0).toFixed(2)}`,
            href: `/invoices?id=${i.Id}`,
            source: "quickbooks" as const,
          }));
      } catch (refreshErr) {
        console.error("QB refresh failed, falling back to cache:", refreshErr);
        try {
          await Promise.all([syncCustomers(refreshedClient), syncInvoices(refreshedClient)]);
        } catch (err) {
          console.error("Failed to sync QB data for cache fallback:", err);
        }

        const qbCustomers = searchQBCustomers(query);
        qbMatchedCustomers = qbCustomers.slice(0, 8).map((c) => ({
          id: c.Id,
          type: "customer" as const,
          title: c.DisplayName,
          subtitle: c.CompanyName || c.PrimaryEmailAddr?.Address || c.PrimaryPhone?.FreeFormNumber || "QuickBooks customer",
          href: `/customers?id=${c.Id}`,
          source: "quickbooks" as const,
        }));

        const qbInvoices = searchQBInvoices(query);
        qbMatchedInvoices = qbInvoices.slice(0, 8).map((i) => ({
          id: i.Id,
          type: "invoice" as const,
          title: i.DocNumber || `Invoice ${i.Id}`,
          subtitle: `${i.CustomerRef?.name || "Unknown"} • $${Number(i.TotalAmt || 0).toFixed(2)}`,
          href: `/invoices?id=${i.Id}`,
          source: "quickbooks" as const,
        }));
      }
    }

    const existingCustomerTitles = new Set(matchedCustomers.map((c) => c.title.toLowerCase()));
    const existingInvoiceNumbers = new Set(matchedInvoices.map((i) => i.title.toLowerCase()));

    for (const qbc of qbMatchedCustomers) {
      if (!existingCustomerTitles.has(qbc.title.toLowerCase())) matchedCustomers.push(qbc);
    }

    for (const qbi of qbMatchedInvoices) {
      if (!existingInvoiceNumbers.has(qbi.title.toLowerCase())) matchedInvoices.push(qbi);
    }
  }

  return NextResponse.json({
    customers: matchedCustomers.slice(0, 10),
    jobs: matchedJobs.slice(0, 10),
    invoices: matchedInvoices.slice(0, 10),
  });
}
