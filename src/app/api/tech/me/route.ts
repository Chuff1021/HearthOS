import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getJobs } from "@/app/api/jobs/route";
import { getLatestLocationsByTech, getMileageSummary } from "@/lib/tech-location-store";
import { getTechDirectory } from "@/lib/tech-directory";
import { getOpenTimeEntry } from "@/lib/time-entry-store";

function normalize(value: string | undefined | null) {
  return String(value || "").trim().toLowerCase();
}

function samePerson(a: string | undefined | null, b: string | undefined | null) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftParts = left.split(/\s+/).filter(Boolean);
  const rightParts = right.split(/\s+/).filter(Boolean);
  return leftParts.length > 0 && rightParts.length > 0 && leftParts[0] === rightParts[0];
}

function isAssignedToTech(job: any, tech: { id: string; name?: string; email?: string }, user: { id: string; name?: string; email?: string }) {
  const assigned = Array.isArray(job.assignedTechs) ? job.assignedTechs : [];
  return assigned.some((entry: any) => {
    const entryId = String(entry?.id || "");
    const entryName = String(entry?.name || "");
    return (
      (tech.id && entryId === tech.id) ||
      (user.id && entryId === user.id) ||
      samePerson(entryName, tech.name) ||
      samePerson(entryName, user.name) ||
      samePerson(entryName, user.email)
    );
  });
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const authEmail = user.primaryEmailAddress?.emailAddress || "";
    const authName = user.fullName || user.firstName || user.username || "";
    const linkedTechId = user.unsafeMetadata?.techId as string | undefined;

    const [directory, latestLocations] = await Promise.all([
      getTechDirectory(),
      getLatestLocationsByTech(),
    ]);

    let tech =
      (linkedTechId ? directory.find((entry) => entry.id === linkedTechId) : undefined) ||
      directory.find((entry) => normalize(entry.email) === normalize(authEmail)) ||
      directory.find((entry) => samePerson(entry.name, authName)) ||
      null;

    // Server-side auto-link: persist techId to Clerk metadata if found but not yet linked
    if (tech && (!linkedTechId || linkedTechId !== tech.id)) {
      try {
        await client.users.updateUser(userId, {
          unsafeMetadata: { ...(user.unsafeMetadata || {}), techId: tech.id },
        });
      } catch {
        // non-fatal — linking will retry next request
      }
    }

    // Server-side auto-create: if no tech record exists, create one automatically
    if (!tech && authEmail) {
      try {
        const createRes = await fetch(
          `${request.nextUrl.origin}/api/techs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: authName || "Service Tech",
              email: authEmail,
              phone: "",
              role: "tech",
            }),
          }
        );
        if (createRes.ok) {
          const createData = await createRes.json().catch(() => null);
          if (createData?.tech?.id) {
            tech = {
              id: createData.tech.id,
              name: createData.tech.name || authName || "Service Tech",
              email: createData.tech.email || authEmail,
              color: createData.tech.color || "#2563EB",
              initials: createData.tech.initials || (authName || authEmail || "ST").split(" ").filter(Boolean).map((p: string) => p[0]).join("").slice(0, 3).toUpperCase(),
              role: "tech" as const,
              active: true,
            };
            // Link the newly created tech to Clerk
            try {
              await client.users.updateUser(userId, {
                unsafeMetadata: { ...(user.unsafeMetadata || {}), techId: tech.id },
              });
            } catch {
              // non-fatal
            }
          }
        }
      } catch {
        // auto-create failed — fall through to fallback
      }
    }

    const effectiveTech = tech
      ? tech
      : {
          id: user.id,
          name: authName || "Service Tech",
          email: authEmail,
          color: "#2563EB",
          initials: (authName || authEmail || "ST")
            .split(" ")
            .filter(Boolean)
            .map((part) => part[0])
            .join("")
            .slice(0, 3)
            .toUpperCase(),
          role: "tech" as const,
          active: true,
        };

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const jobs = (await getJobs())
      .filter((job) =>
        isAssignedToTech(
          job,
          { id: effectiveTech.id, name: effectiveTech.name, email: effectiveTech.email },
          { id: user.id, name: authName, email: authEmail }
        )
      )
      .sort((a, b) => {
        const left = `${a.scheduledDate}T${a.scheduledTimeStart || "00:00"}`;
        const right = `${b.scheduledDate}T${b.scheduledTimeStart || "00:00"}`;
        return left.localeCompare(right);
      });

    const todaysJobs = jobs.filter((job) => job.scheduledDate === today);
    const openEntry = await getOpenTimeEntry([effectiveTech.id, user.id]);

    const latestLocation =
      latestLocations.find((entry) => entry.techId === effectiveTech.id) ||
      latestLocations.find((entry) => normalize(entry.techEmail) === normalize(effectiveTech.email)) ||
      latestLocations.find((entry) => entry.techId === user.id) ||
      null;

    const completedToday = todaysJobs.filter((job) => job.status === "completed").length;
    const activeJob = jobs.find((job) => job.status === "in_progress") || null;
    const mileage = await getMileageSummary(effectiveTech.id);

    // Check owner flag
    let isOwner = false;
    try {
      const { db, users: usersTable } = await import("@/db");
      const { eq } = await import("drizzle-orm");
      const ownerRows = await db.select().from(usersTable).where(eq(usersTable.id, effectiveTech.id)).limit(1);
      isOwner = Boolean((ownerRows[0] as any)?.isOwner);
    } catch {
      // is_owner column may not exist yet — default to false
    }

    return NextResponse.json({
      tech: effectiveTech,
      authUser: {
        id: user.id,
        name: authName,
        email: authEmail,
      },
      isOwner,
      jobs,
      todaysJobs,
      activeJob,
      clockEntry: openEntry,
      latestLocation,
      stats: {
        jobsToday: todaysJobs.length,
        jobsCompletedToday: completedToday,
        upcomingJobs: jobs.filter((job) => job.status === "scheduled").length,
        milesToday: mileage.dayMiles,
        milesWeek: mileage.weekMiles,
        milesMonth: mileage.monthMiles,
      },
      linked: !!tech,
    });
  } catch (error) {
    console.error("Failed to load tech session:", error);
    return NextResponse.json({ error: "Failed to load tech session" }, { status: 500 });
  }
}
