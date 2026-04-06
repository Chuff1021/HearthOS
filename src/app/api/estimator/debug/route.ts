import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

// Returns a summary of what's in the estimator knowledge base
// so you can diagnose why catalog matching fails
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const rows = await sql`SELECT id, updated_at, jsonb_object_keys(data) as key FROM estimator_knowledge LIMIT 0`;
    // Get all knowledge rows
    const allRows = await sql`SELECT id, updated_at, data FROM estimator_knowledge`;

    const result: Record<string, any> = {};
    for (const row of allRows) {
      if (row.id === "product-catalog") {
        const catalog = row.data as Record<string, any>;
        result["product-catalog"] = {
          updatedAt: row.updated_at,
          count: Object.keys(catalog).length,
          products: Object.values(catalog).map((p: any) => ({
            partNumber: p.partNumber,
            description: p.description,
            consensusComponents: p.consensusComponents?.length || 0,
            totalTemplatesAnalyzed: p.totalTemplatesAnalyzed || 0,
          })),
        };
      } else if (row.id === "pricing") {
        const pricing = row.data as Record<string, any>;
        result["pricing"] = {
          updatedAt: row.updated_at,
          count: Object.keys(pricing).length,
          topItems: Object.values(pricing)
            .sort((a: any, b: any) => b.timesUsed - a.timesUsed)
            .slice(0, 20)
            .map((i: any) => `${i.name} | $${i.mostRecentPrice || i.avgPrice} | used ${i.timesUsed}x`),
        };
      } else if (row.id === "install-types") {
        const guide = row.data as Record<string, string[]>;
        result["install-types"] = {
          updatedAt: row.updated_at,
          vertical: guide.vertical?.slice(0, 10) || [],
          horizontal: guide.horizontal?.slice(0, 10) || [],
          insert: guide.insert?.slice(0, 10) || [],
          service: guide.service?.slice(0, 10) || [],
        };
      }
    }

    await sql.end();
    return NextResponse.json(result);
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
