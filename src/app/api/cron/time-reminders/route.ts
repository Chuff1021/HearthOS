import { NextResponse } from "next/server";
import postgres from "postgres";

/**
 * Time reminder cron — runs at 8:31 AM and 5:01 PM CT
 *
 * 8:31 AM: Checks if any active techs haven't clocked in yet
 * 5:01 PM: Checks if any techs are still clocked in (reminder, not forced clock-out)
 *
 * Results are stored in a table for the admin dashboard to display.
 * Future: can integrate with SMS/push notifications.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "No database" }, { status: 500 });
  }

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

  try {
    // Ensure reminders table
    await sql`
      CREATE TABLE IF NOT EXISTS hearth_time_reminders (
        id TEXT PRIMARY KEY,
        tech_id TEXT NOT NULL,
        tech_name TEXT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        acknowledged BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    // Get current time in Central Time (approximate — offset from UTC)
    const now = new Date();
    const ctOffset = -5; // CDT (use -6 for CST)
    const ctHour = (now.getUTCHours() + ctOffset + 24) % 24;
    const ctMinute = now.getUTCMinutes();
    const today = now.toISOString().split("T")[0];

    // Get all active techs
    const techs = await sql`
      SELECT id, COALESCE(first_name || ' ' || last_name, email) as name
      FROM users
      WHERE is_active = true AND role IN ('technician', 'tech', 'admin')
    `;

    // Get today's open time entries
    const openEntries = await sql`
      SELECT tech_id FROM hearth_time_entries
      WHERE status = 'open'
    `;
    const clockedInIds = new Set(openEntries.map((e: any) => e.tech_id));

    // Get today's closed entries (techs who worked today)
    const todayEntries = await sql`
      SELECT DISTINCT tech_id FROM hearth_time_entries
      WHERE clock_in_at::date = ${today}::date
    `;
    const workedTodayIds = new Set(todayEntries.map((e: any) => e.tech_id));

    const reminders: any[] = [];

    // Morning check (8:31 AM) — who hasn't clocked in?
    if (ctHour === 8 && ctMinute >= 30 && ctMinute <= 35) {
      // Only on weekdays
      const dayOfWeek = now.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        for (const tech of techs) {
          if (!clockedInIds.has(tech.id) && !workedTodayIds.has(tech.id)) {
            const id = `rem-${Date.now()}-${tech.id}`;
            reminders.push({
              id,
              techId: tech.id,
              techName: tech.name,
              type: "clock_in_reminder",
              message: `${tech.name} has not clocked in yet today (shift starts at 8:30 AM)`,
            });
          }
        }
      }
    }

    // Evening check (5:01 PM) — who is still clocked in?
    if (ctHour === 17 && ctMinute >= 0 && ctMinute <= 5) {
      for (const tech of techs) {
        if (clockedInIds.has(tech.id)) {
          const id = `rem-${Date.now()}-${tech.id}`;
          reminders.push({
            id,
            techId: tech.id,
            techName: tech.name,
            type: "clock_out_reminder",
            message: `${tech.name} is still clocked in past 5:00 PM`,
          });
        }
      }
    }

    // Store reminders
    for (const rem of reminders) {
      await sql`
        INSERT INTO hearth_time_reminders (id, tech_id, tech_name, type, message)
        VALUES (${rem.id}, ${rem.techId}, ${rem.techName}, ${rem.type}, ${rem.message})
        ON CONFLICT (id) DO NOTHING
      `;
    }

    await sql.end();

    return NextResponse.json({
      checked: true,
      hour: ctHour,
      minute: ctMinute,
      remindersCreated: reminders.length,
      reminders: reminders.map((r) => ({ type: r.type, tech: r.techName })),
    });
  } catch (err) {
    try { await sql.end(); } catch {}
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
