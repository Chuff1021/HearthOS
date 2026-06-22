import { NextRequest, NextResponse } from "next/server";

const token =
  process.env.MAPBOX_SECRET_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  "";

function parsePoint(value: string | null) {
  if (!value) return null;
  const [latRaw, lngRaw] = value.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function GET(req: NextRequest) {
  if (!token) {
    return NextResponse.json({ error: "Mapbox token is not configured" }, { status: 503 });
  }

  const from = parsePoint(req.nextUrl.searchParams.get("from"));
  const to = parsePoint(req.nextUrl.searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to coordinates" }, { status: 400 });
  }

  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("steps", "false");
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ error: "Directions failed" }, { status: res.status });
  }

  const data = await res.json();
  const route = data?.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  return NextResponse.json({
    durationMin: Math.max(1, Math.round(Number(route.duration || 0) / 60)),
    distanceMiles: Number(route.distance || 0) / 1609.344,
    coordinates: coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
    source: "mapbox",
  });
}
