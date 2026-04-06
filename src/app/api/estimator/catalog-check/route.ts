import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const rows = await sql`SELECT id, updated_at, data FROM estimator_knowledge`;
    const out: any = {};
    for (const row of rows) {
      if (row.id === "product-catalog") {
        const d = row.data as Record<string, any>;
        out.catalog = {
          updatedAt: row.updated_at,
          count: Object.keys(d).length,
          products: Object.values(d).map((p: any) => ({
            partNumber: p.partNumber,
            modelName: p.modelName,
            description: p.description,
            consensusCount: p.consensusComponents?.length || 0,
          })),
        };
      } else if (row.id === "pricing") {
        const d = row.data as Record<string, any>;
        out.pricing = {
          updatedAt: row.updated_at,
          count: Object.keys(d).length,
          topItems: Object.values(d)
            .sort((a: any, b: any) => b.timesUsed - a.timesUsed)
            .slice(0, 30)
            .map((i: any) => i.name),
        };
      } else if (row.id === "install-types") {
        out.installTypes = { updatedAt: row.updated_at, data: row.data };
      }
    }
    await sql.end();
    return NextResponse.json(out);
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
