import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database configured" }, { status: 500 });
  }

  const sql = postgres(process.env.DATABASE_URL, { prepare: false });

  try {
    const result = await sql`
      delete from tech_locations_live
      where ts < now() - interval '30 days'
      returning id;
    `;

    await sql.end();
    return NextResponse.json({ deleted: result.length });
  } catch (err) {
    await sql.end();
    console.error("Cleanup failed:", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
