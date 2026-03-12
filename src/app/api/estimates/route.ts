import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { origin } = new URL(request.url);
    const res = await fetch(`${origin}/api/quickbooks/estimates`, {
      headers: { cookie: request.headers.get("cookie") || "" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json({ estimates: [], total: 0, error: data.error || "Failed to fetch estimates" }, { status: res.status });
    }

    return NextResponse.json({
      estimates: data.estimates || [],
      total: data.total || (data.estimates || []).length,
    });
  } catch (err) {
    console.error("Failed to proxy estimates:", err);
    return NextResponse.json({ estimates: [], total: 0, error: "Failed to fetch estimates" }, { status: 500 });
  }
}
