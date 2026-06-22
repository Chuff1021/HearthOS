import { NextRequest, NextResponse } from "next/server";

type Point = [number, number];

const token =
  process.env.MAPBOX_SECRET_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  "";

async function fallbackGeocode(query: string): Promise<{ center: Point; label: string; source: string } | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "HearthOS field-service dispatch",
    },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows[0]?.lat || !rows[0]?.lon) return null;
  return {
    center: [Number(rows[0].lat), Number(rows[0].lon)],
    label: rows[0].display_name || query,
    source: "nominatim",
  };
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  if (!token) {
    const fallback = await fallbackGeocode(query);
    if (!fallback) return NextResponse.json({ error: "Address not found" }, { status: 404 });
    return NextResponse.json(fallback);
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "us");
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) {
    const fallback = await fallbackGeocode(query);
    if (fallback) return NextResponse.json(fallback);
    return NextResponse.json({ error: "Geocoding failed" }, { status: res.status });
  }

  const data = await res.json();
  const feature = data?.features?.[0];
  const center = feature?.center;
  if (!Array.isArray(center) || center.length < 2) {
    const fallback = await fallbackGeocode(query);
    if (fallback) return NextResponse.json(fallback);
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  return NextResponse.json({
    center: [Number(center[1]), Number(center[0])] satisfies Point,
    label: feature.place_name || query,
    source: "mapbox",
  });
}
