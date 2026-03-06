import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)));
    if (!process.env.DATABASE_URL) return NextResponse.json({ runs: [], total: 0 });

    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
    await sql`create table if not exists gabe_run_metadata (id bigserial primary key, ts timestamptz not null default now(), payload jsonb not null)`;
    const totalRows = await sql<{ count: number }[]>`select count(*)::int as count from gabe_run_metadata`;
    const rows = await sql<{ ts: string; payload: any }[]>`
      select ts, payload
      from gabe_run_metadata
      order by ts desc
      limit ${limit}
    `;

    const runs = rows.map((r) => {
      let payload: any = r.payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = { raw: payload }; }
      }
      const p = payload || {};
      const run_outcome = p.run_outcome || (
        p.source_type === 'none' ? 'source_evidence_missing'
        : p.certainty === 'Verified Exact' ? 'answered_verified'
        : p.certainty === 'Verified Partial' || p.certainty === 'Interpreted' ? 'answered_partial'
        : 'refused_unverified'
      );
      const truth_audit_status = p.truth_audit_status || 'pending';
      return { ts: new Date(r.ts).toISOString(), ...p, run_outcome, truth_audit_status };
    });
    return NextResponse.json({ runs, total: totalRows[0]?.count || 0 });
  } catch {
    return NextResponse.json({ error: 'Failed to read run metadata' }, { status: 500 });
  }
}
