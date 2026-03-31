import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

const PAYROLL_EMAIL = "aaronsfireplace.shelly@gmail.com";

let initDone = false;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return postgres(url, { prepare: false, max: 2 });
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  if (initDone) return;
  await sql`
    CREATE TABLE IF NOT EXISTS hearth_timesheet_approvals (
      id TEXT PRIMARY KEY,
      tech_id TEXT NOT NULL,
      tech_name TEXT,
      week_start TEXT NOT NULL,
      total_minutes INTEGER NOT NULL,
      overtime_minutes INTEGER DEFAULT 0,
      regular_hours NUMERIC(6,2),
      overtime_hours NUMERIC(6,2),
      approved_by TEXT,
      approved_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(tech_id, week_start)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS hearth_payroll_reports (
      id TEXT PRIMARY KEY,
      week_start TEXT NOT NULL,
      sent_to TEXT,
      sent_at TIMESTAMPTZ DEFAULT now(),
      report_csv TEXT,
      tech_count INTEGER,
      total_hours NUMERIC(8,2)
    )
  `;
  initDone = true;
}

// GET: check approval status for a week
export async function GET(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ approvals: [], reports: [] });

  try {
    await ensureTable(sql);
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    if (!weekStart) {
      await sql.end();
      return NextResponse.json({ error: "weekStart required" }, { status: 400 });
    }

    const approvals = await sql`
      SELECT * FROM hearth_timesheet_approvals WHERE week_start = ${weekStart} ORDER BY tech_name
    `;
    const reports = await sql`
      SELECT id, week_start, sent_to, sent_at, tech_count, total_hours FROM hearth_payroll_reports WHERE week_start = ${weekStart} ORDER BY sent_at DESC
    `;

    await sql.end();
    return NextResponse.json({ approvals, reports });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: approve a tech's timesheet OR send payroll report
export async function POST(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "No database" }, { status: 500 });

  try {
    await ensureTable(sql);
    const body = await request.json();
    const { action } = body;

    // Approve individual tech's timesheet
    if (action === "approve") {
      const { techId, techName, weekStart, totalMinutes } = body;
      if (!techId || !weekStart) {
        await sql.end();
        return NextResponse.json({ error: "techId and weekStart required" }, { status: 400 });
      }

      const regularMin = Math.min(totalMinutes, 2400); // 40 hrs = 2400 min
      const overtimeMin = Math.max(0, totalMinutes - 2400);
      const id = `ta-${Date.now()}-${techId.slice(0, 8)}`;

      await sql`
        INSERT INTO hearth_timesheet_approvals (id, tech_id, tech_name, week_start, total_minutes, overtime_minutes, regular_hours, overtime_hours, approved_by)
        VALUES (${id}, ${techId}, ${techName || null}, ${weekStart}, ${totalMinutes}, ${overtimeMin},
          ${(regularMin / 60).toFixed(2)}, ${(overtimeMin / 60).toFixed(2)}, ${"admin"})
        ON CONFLICT (tech_id, week_start) DO UPDATE SET
          total_minutes = ${totalMinutes},
          overtime_minutes = ${overtimeMin},
          regular_hours = ${(regularMin / 60).toFixed(2)},
          overtime_hours = ${(overtimeMin / 60).toFixed(2)},
          approved_by = ${"admin"},
          approved_at = now()
      `;

      await sql.end();
      return NextResponse.json({ approved: true, techId, weekStart });
    }

    // Send payroll report
    if (action === "send_report") {
      const { weekStart, approvals: approvalData } = body;
      if (!weekStart || !approvalData?.length) {
        await sql.end();
        return NextResponse.json({ error: "weekStart and approvals required" }, { status: 400 });
      }

      // Build CSV
      const csvLines = [
        "Employee,Regular Hours,Overtime Hours,Total Hours,Week Starting"
      ];
      let totalHours = 0;

      for (const a of approvalData) {
        const regular = (Math.min(a.totalMinutes, 2400) / 60).toFixed(2);
        const overtime = (Math.max(0, a.totalMinutes - 2400) / 60).toFixed(2);
        const total = (a.totalMinutes / 60).toFixed(2);
        totalHours += a.totalMinutes / 60;
        csvLines.push(`${a.techName || a.techId},${regular},${overtime},${total},${weekStart}`);
      }

      const csv = csvLines.join("\n");

      // Send email via Gmail MCP if available, otherwise store for manual download
      let emailSent = false;
      try {
        // Try sending via a simple email API
        // For now, we'll use the Gmail integration if configured
        const gmailRes = await fetch(`${request.nextUrl.origin}/api/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: PAYROLL_EMAIL,
            subject: `Aaron's Fireplace - Payroll Report Week of ${weekStart}`,
            body: `Please find the weekly payroll report attached.\n\nWeek: ${weekStart}\nEmployees: ${approvalData.length}\nTotal Hours: ${totalHours.toFixed(2)}\n\n${csv}`,
            csv,
          }),
        });
        emailSent = gmailRes.ok;
      } catch {
        // Email send failed — report still saved for download
      }

      // Store the report
      const reportId = `pr-${Date.now()}`;
      await sql`
        INSERT INTO hearth_payroll_reports (id, week_start, sent_to, report_csv, tech_count, total_hours)
        VALUES (${reportId}, ${weekStart}, ${emailSent ? PAYROLL_EMAIL : "not_sent"}, ${csv}, ${approvalData.length}, ${totalHours.toFixed(2)})
      `;

      await sql.end();
      return NextResponse.json({
        reportId,
        emailSent,
        sentTo: emailSent ? PAYROLL_EMAIL : null,
        csv,
        techCount: approvalData.length,
        totalHours: totalHours.toFixed(2),
      });
    }

    await sql.end();
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
