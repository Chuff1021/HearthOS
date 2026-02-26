import { NextRequest, NextResponse } from "next/server";
import { getCustomers, getInvoices } from "@/lib/data-store";
import { getJobs as getJobsFromApi } from "../jobs/route";
import { getOrCreateDefaultOrg } from "@/lib/org";
import {
  searchCustomers as searchQBCustomers,
  searchInvoices as searchQBInvoices,
  getCachedCustomers,
  getCachedInvoices,
  getClientFromTokens,
  syncCustomers,
  syncInvoices,
} from "@/lib/quickbooks";
import { transformCustomer } from "@/lib/quickbooks/transform";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.toLowerCase() || "";

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
  const jobs = getJobsFromApi();
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

  // If no cookies, check org tokens
  if (!qbConnected) {
    try {
      const org = await getOrCreateDefaultOrg();
      if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
        accessToken = org.qbAccessToken;
        refreshToken = org.qbRefreshToken;
        realmId = org.qbRealmId;
        qbConnected = true;
      }
    } catch {
      qbConnected = false;
    }
  }

  // If QuickBooks is connected, search QB data
  if (qbConnected && accessToken && refreshToken && realmId) {
    const client = getClientFromTokens(accessToken, refreshToken, realmId);

    // Sync QB data to cache (in background, don't await)
    try {
      await Promise.all([
        syncCustomers(client),
        syncInvoices(client),
      ]);
    } catch (err) {
      console.error("Failed to sync QB data for search:", err);
    }

    // Search QB customers
    const qbCustomers = searchQBCustomers(query);
    const qbMatchedCustomers = qbCustomers.slice(0, 5).map((c) => ({
      id: c.Id || c.Id,
      type: "customer" as const,
      title: c.DisplayName,
      subtitle: c.CompanyName || c.PrimaryEmailAddr?.Address || c.PrimaryPhone?.FreeFormNumber || "No details",
      href: `/customers?id=${c.Id}`,
      source: "quickbooks",
    }));

    // Search QB invoices
    const qbInvoices = searchQBInvoices(query);
    const qbMatchedInvoices = qbInvoices.slice(0, 5).map((i) => ({
      id: i.Id || i.Id,
      type: "invoice" as const,
      title: i.DocNumber || `Invoice ${i.Id}`,
      subtitle: `${i.CustomerRef?.name || "Unknown"} • $${i.TotalAmt?.toFixed(2) || "0.00"}`,
      href: `/invoices?id=${i.Id}`,
      source: "quickbooks",
    }));

    // Merge QB results with local results (avoiding duplicates by title)
    const existingCustomerTitles = new Set(matchedCustomers.map((c) => c.title.toLowerCase()));
    const existingInvoiceNumbers = new Set(matchedInvoices.map((i) => i.title.toLowerCase()));

    for (const qbc of qbMatchedCustomers) {
      if (!existingCustomerTitles.has(qbc.title.toLowerCase())) {
        matchedCustomers.push(qbc);
      }
    }

    for (const qbi of qbMatchedInvoices) {
      if (!existingInvoiceNumbers.has(qbi.title.toLowerCase())) {
        matchedInvoices.push(qbi);
      }
    }
  }

  return NextResponse.json({
    customers: matchedCustomers.slice(0, 10),
    jobs: matchedJobs.slice(0, 10),
    invoices: matchedInvoices.slice(0, 10),
  });
}
