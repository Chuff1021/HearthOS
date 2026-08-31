import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

function localClock(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: value("weekday"),
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "No database" }, { status: 500 });

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
  try {
    await sql`
      create table if not exists hearth_time_reminders (
        id text primary key,
        org_id uuid not null references organizations(id) on delete cascade,
        tech_id text not null,
        tech_name text,
        type text not null,
        message text not null,
        acknowledged boolean default false,
        created_at timestamptz default now()
      )
    `;
    const organizations = await sql<{ id: string; timezone: string | null }[]>`
      select id, timezone from organizations order by created_at
    `;
    const reminders: Array<{ orgId: string; type: string; tech: string }> = [];

    for (const organization of organizations) {
      const clock = localClock(organization.timezone || "America/Chicago");
      const morningWindow = clock.weekday !== "Sat" && clock.weekday !== "Sun" && clock.hour === 8 && clock.minute >= 30 && clock.minute <= 35;
      const eveningWindow = clock.hour === 17 && clock.minute >= 0 && clock.minute <= 5;
      if (!morningWindow && !eveningWindow) continue;

      const [techs, openEntries, todayEntries] = await Promise.all([
        sql<{ id: string; name: string }[]>`
          select id, coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email) as name
          from users
          where org_id = ${organization.id} and is_active = true and role in ('technician', 'tech', 'admin')
        `,
        sql<{ tech_id: string }[]>`
          select tech_id from hearth_time_entries where org_id = ${organization.id} and status = 'open'
        `,
        sql<{ tech_id: string }[]>`
          select distinct tech_id from hearth_time_entries
          where org_id = ${organization.id}
            and (clock_in_at at time zone ${organization.timezone || "America/Chicago"})::date = ${clock.date}::date
        `,
      ]);
      const clockedIn = new Set(openEntries.map((entry) => entry.tech_id));
      const workedToday = new Set(todayEntries.map((entry) => entry.tech_id));

      for (const tech of techs) {
        let type = "";
        let message = "";
        if (morningWindow && !clockedIn.has(tech.id) && !workedToday.has(tech.id)) {
          type = "clock_in_reminder";
          message = `${tech.name} has not clocked in yet today (shift starts at 8:30 AM)`;
        } else if (eveningWindow && clockedIn.has(tech.id)) {
          type = "clock_out_reminder";
          message = `${tech.name} is still clocked in past 5:00 PM`;
        }
        if (!type) continue;

        const id = `rem-${organization.id}-${clock.date}-${type}-${tech.id}`;
        const inserted = await sql`
          insert into hearth_time_reminders (id, org_id, tech_id, tech_name, type, message)
          values (${id}, ${organization.id}, ${tech.id}, ${tech.name}, ${type}, ${message})
          on conflict (id) do nothing
          returning id
        `;
        if (inserted.length) reminders.push({ orgId: organization.id, type, tech: tech.name });
      }
    }

    return NextResponse.json({ checked: true, organizationsChecked: organizations.length, remindersCreated: reminders.length });
  } catch (error) {
    console.error("Time reminder cron failed:", error);
    return NextResponse.json({ error: "Time reminder check failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
