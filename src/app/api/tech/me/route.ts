import { authorizeCrmApi } from "@/lib/security/crm-access";
import { NextRequest, NextResponse } from "next/server";
import { requireCrmActor } from "@/lib/security/crm-access";
import { canAccessJob } from "@/lib/security/access-policy";
import { getJobs } from "@/app/api/jobs/route";
import { getLatestLocationsByTech, getMileageSummary } from "@/lib/tech-location-store";
import { getTechDirectory } from "@/lib/tech-directory";
import { getOpenTimeEntry } from "@/lib/time-entry-store";

function normalize(value: string | undefined | null) {
  return String(value || "").trim().toLowerCase();
}

export async function GET() {
  const accessDenied = await authorizeCrmApi("/api/tech/me", "GET");
  if (accessDenied) return accessDenied;
  try {
    const actor = await requireCrmActor();
    const directory = await getTechDirectory();
    const tech = directory.find((entry) => entry.id === actor.employeeId && entry.active);
    if (!tech) return NextResponse.json({ error: "Employee record unavailable" }, { status: 403 });
    const user = { id: actor.clerkUserId };
    const authEmail = actor.email;
    const authName = actor.name;
    const effectiveTech = tech;
    const latestLocations = await getLatestLocationsByTech();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const jobs = (await getJobs())
      .filter((job) => canAccessJob({ ...actor, role: "technician" }, job))
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

    const isOwner = actor.role === "owner";

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
