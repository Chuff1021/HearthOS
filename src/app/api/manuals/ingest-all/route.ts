import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database configured" }, { status: 500 });
  }

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    // Get all active manuals that haven't been ingested yet (no sections)
    const manuals = await sql`
      SELECT m.id, m.brand, m.model, m.type, m.url
      FROM manuals m
      WHERE m.is_active = true
      ORDER BY m.brand, m.model
    `;

    // Check which ones already have sections
    const withSections = await sql`
      SELECT DISTINCT manual_id FROM manual_sections
    `;
    const ingestedIds = new Set(withSections.map((r: any) => r.manual_id));

    const toIngest = manuals.filter((m: any) => !ingestedIds.has(m.id));

    await sql.end();

    const results: any[] = [];

    for (const manual of toIngest) {
      try {
        const origin = request.nextUrl.origin;
        const res = await fetch(`${origin}/api/manuals/ingest-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manualId: manual.id }),
        });
        const data = await res.json();
        results.push({
          manualId: manual.id,
          brand: manual.brand,
          model: manual.model,
          status: res.ok ? "success" : "failed",
          ...data,
        });
      } catch (e) {
        results.push({
          manualId: manual.id,
          brand: manual.brand,
          model: manual.model,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      totalManuals: manuals.length,
      alreadyIngested: ingestedIds.size,
      processed: results.length,
      results,
    });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Failed",
    }, { status: 500 });
  }
}
