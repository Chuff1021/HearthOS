import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, timesheetEntries } from "@/db";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { isClerkConfigured } from "@/lib/auth";

type RequestContext = {
  orgId: string;
  techUserId: string;
};

async function getRequestContext(): Promise<RequestContext> {
  const fallbackOrg = await getOrCreateDefaultOrg();

  if (!isClerkConfigured()) {
    return {
      orgId: fallbackOrg.id,
      techUserId: "system-tech",
    };
  }

  const session = await auth();

  return {
    orgId: session.orgId || fallbackOrg.id,
    techUserId: session.userId || "system-tech",
  };
}

async function getOpenShift(orgId: string, techUserId: string) {
  const open = await db
    .select()
    .from(timesheetEntries)
    .where(
      and(
        eq(timesheetEntries.orgId, orgId),
        eq(timesheetEntries.techUserId, techUserId),
        isNull(timesheetEntries.clockOutAt)
      )
    )
    .orderBy(desc(timesheetEntries.clockInAt))
    .limit(1);

  return open[0] ?? null;
}

// GET current clock status for active technician
export async function GET() {
  try {
    const { orgId, techUserId } = await getRequestContext();
    const openShift = await getOpenShift(orgId, techUserId);

    return NextResponse.json({
      isClockedIn: Boolean(openShift),
      shiftStartTime: openShift?.clockInAt ?? null,
      entryId: openShift?.id ?? null,
    });
  } catch (err) {
    console.error("Failed to get timeclock status:", err);
    return NextResponse.json({ error: "Failed to get clock status" }, { status: 500 });
  }
}

// POST clock in/out
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body?.action;

    if (action !== "clock_in" && action !== "clock_out") {
      return NextResponse.json(
        { error: "Invalid action. Use 'clock_in' or 'clock_out'." },
        { status: 400 }
      );
    }

    const { orgId, techUserId } = await getRequestContext();
    const openShift = await getOpenShift(orgId, techUserId);

    if (action === "clock_in") {
      if (openShift) {
        return NextResponse.json(
          { error: "You are already clocked in.", shiftStartTime: openShift.clockInAt },
          { status: 409 }
        );
      }

      const created = await db
        .insert(timesheetEntries)
        .values({
          orgId,
          techUserId,
          clockInAt: new Date(),
        })
        .returning();

      return NextResponse.json(
        {
          isClockedIn: true,
          shiftStartTime: created[0].clockInAt,
          entryId: created[0].id,
        },
        { status: 201 }
      );
    }

    // clock_out
    if (!openShift) {
      return NextResponse.json({ error: "No active shift to clock out." }, { status: 409 });
    }

    const now = new Date();
    const updated = await db
      .update(timesheetEntries)
      .set({
        clockOutAt: now,
        updatedAt: now,
      })
      .where(eq(timesheetEntries.id, openShift.id))
      .returning();

    return NextResponse.json({
      isClockedIn: false,
      shiftStartTime: null,
      entryId: updated[0]?.id ?? openShift.id,
      clockedOutAt: updated[0]?.clockOutAt ?? now,
    });
  } catch (err) {
    console.error("Failed to update timeclock status:", err);
    return NextResponse.json({ error: "Failed to update clock status" }, { status: 500 });
  }
}
