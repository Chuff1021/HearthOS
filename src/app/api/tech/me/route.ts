import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getJobs } from "@/app/api/jobs/route";
import { getLatestLocationsByTech } from "@/lib/tech-location-store";
import { getTechDirectory } from "@/lib/tech-directory";
import { readJsonFile } from "@/lib/persist-json";

type TimeEntry = {
  id: string;
  techId: string;
  techName?: string;
  clockInAt: string;
  clockOutAt?: string;
  totalMinutes?: number;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
};

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
    const openEntry =
      readJsonFile<TimeEntry[]>("time-entries.json", [])
        .filter((entry) => entry.status === "open")
        .find((entry) => entry.techId === effectiveTech.id || entry.techId === user.id) || null;

    const latestLocation =
      latestLocations.find((entry) => entry.techId === effectiveTech.id) ||
      latestLocations.find((entry) => normalize(entry.techEmail) === normalize(effectiveTech.email)) ||
      latestLocations.find((entry) => entry.techId === user.id) ||
      null;

    const completedToday = todaysJobs.filter((job) => job.status === "completed").length;
    const activeJob = jobs.find((job) => job.status === "in_progress") || null;

    return NextResponse.json({
      tech: effectiveTech,
      authUser: {
        id: user.id,
        name: authName,
        email: authEmail,
      },
      jobs,
      todaysJobs,
      activeJob,
      clockEntry: openEntry,
      latestLocation,
      stats: {
        jobsToday: todaysJobs.length,
        jobsCompletedToday: completedToday,
        upcomingJobs: jobs.filter((job) => job.status === "scheduled").length,
      },
      linked: !!tech,
    });
  } catch (error) {
    console.error("Failed to load tech session:", error);
    return NextResponse.json({ error: "Failed to load tech session" }, { status: 500 });
  }
}
