import { NextRequest, NextResponse } from "next/server";

function mapCustomer(customer: any) {
  return {
    id: customer.id,
    displayName: customer.displayName || customer.name || customer.companyName || "",
    phone: customer.phone || customer.primaryPhone || customer?.PrimaryPhone?.FreeFormNumber,
    email: customer.email,
    address: customer.address,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";

  if (q.length < 2) {
    return NextResponse.json({ customers: [], total: 0, source: "none" });
  }

  try {
    const qbRes = await fetch(`${origin}/api/quickbooks/customers?q=${encodeURIComponent(q)}&live=true`, {
      headers: { cookie: request.headers.get("cookie") || "" },
      cache: "no-store",
    });
    const qbData = await qbRes.json().catch(() => ({}));
    if (qbRes.ok && Array.isArray(qbData.customers)) {
      return NextResponse.json({
        customers: qbData.customers.map(mapCustomer),
        total: qbData.customers.length,
        source: "quickbooks",
      });
    }
  } catch {}

  try {
    const localRes = await fetch(`${origin}/api/customers?q=${encodeURIComponent(q)}`, {
      headers: { cookie: request.headers.get("cookie") || "" },
      cache: "no-store",
    });
    const localData = await localRes.json().catch(() => ({}));
    if (localRes.ok && Array.isArray(localData.customers)) {
      return NextResponse.json({
        customers: localData.customers.map(mapCustomer),
        total: localData.customers.length,
        source: "local",
      });
    }
  } catch {}

  return NextResponse.json({ customers: [], total: 0, source: "none" });
}
