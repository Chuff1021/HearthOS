import { NextResponse } from "next/server";
import { getCustomers } from "@/lib/data-store";
import { getJobs } from "../jobs/route";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.toLowerCase() || "";

  if (!query || query.length < 2) {
    return NextResponse.json({ customers: [], jobs: [], invoices: [] });
  }

  // Search customers
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
    }));

  // Search jobs
  const jobs = getJobs();
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
    }));

  // Search invoices (from data-store)
  const { getInvoices } = await import("@/lib/data-store");
  const invoices = getInvoices();
  const matchedInvoices = invoices
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
    }));

  return NextResponse.json({
    customers: matchedCustomers,
    jobs: matchedJobs,
    invoices: matchedInvoices,
  });
}
