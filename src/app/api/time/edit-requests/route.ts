import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { updateTimeEntry } from "@/lib/time-entry-store";

let initDone = false;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return postgres(url, { prepare: false, max: 2 });
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  if (initDone) return;
  await sql`
    CREATE TABLE IF NOT EXISTS hearth_time_edit_requests (
      id TEXT PRIMARY KEY,
      tech_id TEXT NOT NULL,
      tech_name TEXT,
      entry_id TEXT NOT NULL,
      requested_clock_in TEXT,
      requested_clock_out TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_time_edit_requests_tech ON hearth_time_edit_requests (tech_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_time_edit_requests_status ON hearth_time_edit_requests (status, created_at DESC)`;
  initDone = true;
}

export async function GET(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ requests: [] });

  try {
    await ensureTable(sql);
    const { searchParams } = new URL(request.url);
    const techId = searchParams.get("techId");
    const status = searchParams.get("status");

    let rows;
    if (techId && status) {
      rows = await sql`SELECT * FROM hearth_time_edit_requests WHERE tech_id = ${techId} AND status = ${status} ORDER BY created_at DESC`;
    } else if (techId) {
      rows = await sql`SELECT * FROM hearth_time_edit_requests WHERE tech_id = ${techId} ORDER BY created_at DESC`;
    } else if (status) {
      rows = await sql`SELECT * FROM hearth_time_edit_requests WHERE status = ${status} ORDER BY created_at DESC`;
    } else {
      rows = await sql`SELECT * FROM hearth_time_edit_requests ORDER BY created_at DESC`;
    }

    await sql.end();
    return NextResponse.json({ requests: rows });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: "Failed to load edit requests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "No database" }, { status: 500 });

  try {
    await ensureTable(sql);
    const body = await request.json();
    const { techId, techName, entryId, requestedClockIn, requestedClockOut, reason } = body;

    if (!techId || !entryId || !reason) {
      await sql.end();
      return NextResponse.json({ error: "techId, entryId, and reason are required" }, { status: 400 });
    }

    const id = `ter-${Date.now()}`;
    await sql`
      INSERT INTO hearth_time_edit_requests (id, tech_id, tech_name, entry_id, requested_clock_in, requested_clock_out, reason, status)
      VALUES (${id}, ${techId}, ${techName || null}, ${entryId}, ${requestedClockIn || null}, ${requestedClockOut || null}, ${reason}, 'pending')
    `;

    await sql.end();
    return NextResponse.json({ id, status: "pending" }, { status: 201 });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: "Failed to create edit request" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "No database" }, { status: 500 });

  try {
    await ensureTable(sql);
    const body = await request.json();
    const { id, status, reviewedBy } = body;

    if (!id || !status) {
      await sql.end();
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }

    // Get the request
    const rows = await sql`SELECT * FROM hearth_time_edit_requests WHERE id = ${id} LIMIT 1`;
    if (rows.length === 0) {
      await sql.end();
      return NextResponse.json({ error: "Edit request not found" }, { status: 404 });
    }

    const editReq = rows[0];

    // If approving, apply the edit to the time entry
    if (status === "approved") {
      await updateTimeEntry({
        id: editReq.entry_id,
        clockInAt: editReq.requested_clock_in || undefined,
        clockOutAt: editReq.requested_clock_out || undefined,
        editNote: `Approved edit request from ${editReq.tech_name || editReq.tech_id}: ${editReq.reason}`,
      });
    }

    // Update the request status
    await sql`
      UPDATE hearth_time_edit_requests
      SET status = ${status}, reviewed_at = now(), reviewed_by = ${reviewedBy || null}, updated_at = now()
      WHERE id = ${id}
    `;

    await sql.end();
    return NextResponse.json({ id, status });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: "Failed to update edit request" }, { status: 500 });
  }
}
