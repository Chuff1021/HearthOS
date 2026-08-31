import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { isSmtpConfigured, sendSmtpEmail } from "@/lib/email/smtp";

const MAX_FIELD = 500;
let sqlClient: ReturnType<typeof postgres> | null = null;
let tablePromise: Promise<void> | null = null;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
}

function sql() {
  const url = databaseUrl();
  if (!url) throw new Error("Demo request storage is not configured.");
  if (!sqlClient) {
    sqlClient = postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 10, prepare: false });
  }
  return sqlClient;
}

async function ensureTable() {
  if (!tablePromise) {
    tablePromise = (async () => {
      const db = sql();
      await db`
        create table if not exists hearth_demo_requests (
          id uuid primary key,
          first_name text not null,
          last_name text not null,
          email text not null,
          phone text not null,
          company text not null,
          role text not null,
          team_size text not null,
          primary_goal text not null,
          current_software text,
          source text not null default 'hearthos-demo-page',
          status text not null default 'new',
          created_at timestamptz not null default now()
        )
      `;
      await db`create index if not exists idx_hearth_demo_requests_created on hearth_demo_requests (created_at desc)`;
      await db`create index if not exists idx_hearth_demo_requests_status on hearth_demo_requests (status)`;
    })();
  }
  await tablePromise;
}

function clean(value: unknown, max = MAX_FIELD) {
  return String(value || "").trim().slice(0, max);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 20_000) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }

    const body = await request.json();
    if (clean(body.website)) {
      return NextResponse.json({ success: true });
    }

    const lead = {
      firstName: clean(body.firstName, 100),
      lastName: clean(body.lastName, 100),
      email: clean(body.email, 255).toLowerCase(),
      phone: clean(body.phone, 50),
      company: clean(body.company, 255),
      role: clean(body.role, 100),
      teamSize: clean(body.teamSize, 50),
      primaryGoal: clean(body.primaryGoal, 255),
      currentSoftware: clean(body.currentSoftware, 255),
    };

    if (!lead.firstName || !lead.lastName || !lead.email || !lead.phone || !lead.company || !lead.role || !lead.teamSize || !lead.primaryGoal) {
      return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      return NextResponse.json({ error: "Enter a valid work email." }, { status: 400 });
    }

    await ensureTable();
    const db = sql();
    const id = crypto.randomUUID();
    await db`
      insert into hearth_demo_requests (
        id, first_name, last_name, email, phone, company, role, team_size, primary_goal, current_software
      ) values (
        ${id}, ${lead.firstName}, ${lead.lastName}, ${lead.email}, ${lead.phone}, ${lead.company},
        ${lead.role}, ${lead.teamSize}, ${lead.primaryGoal}, ${lead.currentSoftware || null}
      )
    `;

    if (isSmtpConfigured()) {
      const to = process.env.DEMO_REQUEST_TO || process.env.SMTP_USER;
      if (to) {
        const rows = [
          ["Name", `${lead.firstName} ${lead.lastName}`],
          ["Company", lead.company],
          ["Email", lead.email],
          ["Phone", lead.phone],
          ["Role", lead.role],
          ["Team size", lead.teamSize],
          ["Primary goal", lead.primaryGoal],
          ["Current software", lead.currentSoftware || "Not provided"],
        ];
        try {
          await sendSmtpEmail({
            to,
            subject: `HearthOS demo request: ${lead.company}`,
            text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
            html: `<h2>New HearthOS demo request</h2>${rows.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("")}`,
          });
        } catch (error) {
          console.error("Demo request saved but notification email failed:", error);
        }
      }
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error("Demo request submission failed:", error);
    return NextResponse.json(
      { error: "We couldn’t submit your request. Please try again." },
      { status: 500 },
    );
  }
}
