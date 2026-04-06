import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { getJobs } from "@/app/api/jobs/route";
import { updateJobRecord } from "@/lib/job-store";
import { getLatestLocationsByTech } from "@/lib/tech-location-store";
import { getTechDirectory } from "@/lib/tech-directory";

function firstName(name: string) {
  return String(name || '').trim().toLowerCase().split(/\s+/)[0] || '';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const latestLocations = await getLatestLocationsByTech();
    const directoryTechs = await getTechDirectory();

    const baseTechs = directoryTechs.map((t) => {
      const techEmail = String((t as any).email || '').toLowerCase();
      const tFirstName = firstName(t.name);
      const loc = latestLocations.find((l) =>
        l.techId === t.id ||
        (!!techEmail && String(l.techEmail || '').toLowerCase() === techEmail) ||
        (!!tFirstName && !!l.techName && firstName(l.techName) === tFirstName)
      );
      const isGenericName = /\bservice\s*tech(?:nician)?\b/i.test(t.name || '');
      const resolvedName = (isGenericName && loc?.techName) ? loc.techName : t.name;
      return {
        id: t.id,
        name: resolvedName,
        color: t.color,
        initials: t.initials,
        status: t.active ? "available" : "offline",
        lastUpdate: loc?.timestamp || "No location yet",
        location: loc
          ? {
              lat: loc.lat,
              lng: loc.lng,
              accuracy: loc.accuracy,
              timestamp: loc.timestamp,
              techName: loc.techName,
            }
          : null,
      };
    });

    // Include active location pings that do not yet map to a team record
    const mappedIds = new Set(baseTechs.map((t) => t.id));
    const mappedEmails = new Set(
      directoryTechs.map((t: any) => String(t.email || '').toLowerCase()).filter(Boolean)
    );
    const freshWindowMs = 30 * 60 * 1000; // show only recent pings
    const now = Date.now();

    const mappedCoordKeys = new Set(
      baseTechs
        .filter((t) => t.location)
        .map((t) => `${t.location!.lat.toFixed(4)},${t.location!.lng.toFixed(4)}`)
    );

    const unmappedLive = latestLocations
      .filter((l) => !mappedIds.has(l.techId))
      .filter((l) => !mappedEmails.has(String(l.techEmail || '').toLowerCase()))
      .filter((l) => now - new Date(l.timestamp).getTime() <= freshWindowMs)
      .filter((l) => !mappedCoordKeys.has(`${l.lat.toFixed(4)},${l.lng.toFixed(4)}`))
      .map((l) => ({
        id: l.techId,
        name: (l.techName && !/\bservice\s*tech(?:nician)?\b/i.test(l.techName))
          ? l.techName
          : (l.techEmail ? l.techEmail.split('@')[0] : l.techId),
        color: '#2563EB',
        initials: (l.techName || l.techId).split(' ').map((p) => p[0]).slice(0,2).join('').toUpperCase(),
        status: 'available',
        lastUpdate: l.timestamp,
        location: {
          lat: l.lat,
          lng: l.lng,
          accuracy: l.accuracy,
          timestamp: l.timestamp,
          techName: l.techName,
        },
      }));

    const techs = [...baseTechs, ...unmappedLive];

    const jobs = await getJobs();
    const today = new Date().toISOString().split("T")[0];

    const unassignedJobs = jobs
      .filter((j) => j.scheduledDate >= today && j.status === "scheduled" && (!j.assignedTechs || j.assignedTechs.length === 0))
      .map((j) => ({
        id: j.id,
        title: j.title,
        customer: j.customerName,
        address: j.propertyAddress,
        scheduledTime: j.scheduledTimeStart,
        jobType: j.jobType,
        priority: j.priority,
      }));

    const techPayload = techs.map((t) => {
      const todays = jobs.filter((j) => j.scheduledDate === today && j.assignedTechs.some((at) => at.id === t.id));
      const inProgress = todays.find((j) => j.status === "in_progress");
      return {
        ...t,
        status: inProgress ? "on_job" : t.status,
        currentJob: inProgress
          ? { id: inProgress.id, title: inProgress.title, customer: inProgress.customerName, address: inProgress.propertyAddress }
          : null,
        nextJob: todays.find((j) => j.status === "scheduled")
          ? {
              id: todays.find((j) => j.status === "scheduled")!.id,
              title: todays.find((j) => j.status === "scheduled")!.title,
              customer: todays.find((j) => j.status === "scheduled")!.customerName,
              address: todays.find((j) => j.status === "scheduled")!.propertyAddress,
              scheduledTime: todays.find((j) => j.status === "scheduled")!.scheduledTimeStart,
            }
          : null,
        jobsToday: todays.length,
        jobsDone: todays.filter((j) => j.status === "completed").length,
      };
    });

    const filteredTechs = activeOnly ? techPayload.filter((t) => t.status !== "offline") : techPayload;

    return NextResponse.json({
      techs: filteredTechs,
      unassignedJobs,
      gpsDebug: {
        latestLocationCount: latestLocations.length,
        unmappedLiveCount: unmappedLive.length,
        allPings: latestLocations.map((l) => ({
          techId: l.techId,
          techName: l.techName || null,
          techEmail: l.techEmail || null,
          timestamp: l.timestamp,
          accuracy: l.accuracy ?? null,
        })),
      },
      stats: {
        totalTechs: techPayload.length,
        activeTechs: techPayload.filter((t) => t.status !== "offline").length,
        onJob: techPayload.filter((t) => t.status === "on_job").length,
        available: techPayload.filter((t) => t.status === "available").length,
        unassigned: unassignedJobs.length,
      },
    });
  } catch (err) {
    console.error("Failed to get dispatch data:", err);
    return NextResponse.json({ error: "Failed to get dispatch data" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, techId, jobId } = body;

    if (action !== "assign" || !techId || !jobId) {
      return NextResponse.json({ error: "action=assign, techId, jobId are required" }, { status: 400 });
    }

    const jobs = await getJobs();
    const techs = await getTechDirectory();
    const tech = techs.find((t) => t.id === techId);
    const idx = jobs.findIndex((j) => j.id === jobId);

    if (idx === -1 || !tech) {
      return NextResponse.json({ error: "Job or tech not found" }, { status: 404 });
    }

    const updated = await updateJobRecord(jobId, {
      assignedTechs: [{ id: tech.id, name: tech.name, color: tech.color }],
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, job: updated });
  } catch (err) {
    console.error("Failed to update dispatch assignment:", err);
    return NextResponse.json({ error: "Failed to update dispatch assignment" }, { status: 500 });
  }
}
