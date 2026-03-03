import { NextResponse } from "next/server";

// Schedule types
export interface ScheduleJob {
  id: string;
  title: string;
  customer: string;
  techId: string;
  day: number; // 0-6 (Sunday-Saturday)
  startHour: number;
  duration: number;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  jobType: "cleaning" | "inspection" | "repair" | "installation" | "service" | "estimate";
}

export interface Tech {
  id: string;
  name: string;
  color: string;
  initials: string;
  active: boolean;
}

// Technicians data
const technicians: Tech[] = [
  { id: "tech-001", name: "Mike Johnson", color: "#2563EB", initials: "MJ", active: true },
  { id: "tech-002", name: "Sarah Williams", color: "#B6F500", initials: "SW", active: true },
  { id: "tech-003", name: "Tom Davis", color: "#FF4400", initials: "TD", active: true },
  { id: "tech-004", name: "Chris Lee", color: "#2563EB", initials: "CL", active: true },
  { id: "tech-005", name: "Amy Walsh", color: "#FF204E", initials: "AW", active: true },
  { id: "tech-006", name: "Jake Rivera", color: "#B6F500", initials: "JR", active: true },
];

// Seed schedule data
const scheduleJobs: ScheduleJob[] = [
  {
    id: "job-001",
    title: "Annual Cleaning",
    customer: "Linda Martinez",
    techId: "tech-001",
    day: 1, // Monday
    startHour: 9,
    duration: 2,
    status: "completed",
    jobType: "cleaning",
  },
  {
    id: "job-002",
    title: "Gas Installation",
    customer: "Robert Chen",
    techId: "tech-002",
    day: 1,
    startHour: 10,
    duration: 6,
    status: "in_progress",
    jobType: "installation",
  },
  {
    id: "job-003",
    title: "Pilot Light Repair",
    customer: "Patricia Williams",
    techId: "tech-001",
    day: 0, // Sunday (past)
    startHour: 14,
    duration: 1.5,
    status: "completed",
    jobType: "repair",
  },
  {
    id: "job-004",
    title: "Wood Stove Inspection",
    customer: "James Thompson",
    techId: "tech-003",
    day: 2, // Tuesday
    startHour: 11,
    duration: 1,
    status: "scheduled",
    jobType: "inspection",
  },
  {
    id: "job-005",
    title: "Pellet Stove Service",
    customer: "Susan Park",
    techId: "tech-004",
    day: 3, // Wednesday
    startHour: 13,
    duration: 2,
    status: "scheduled",
    jobType: "service",
  },
  {
    id: "job-006",
    title: "Fireplace Estimate",
    customer: "Michael Davis",
    techId: "tech-002",
    day: 4, // Thursday
    startHour: 9,
    duration: 1,
    status: "scheduled",
    jobType: "estimate",
  },
  {
    id: "job-007",
    title: "Annual Cleaning",
    customer: "Karen Wilson",
    techId: "tech-003",
    day: 5, // Friday
    startHour: 8,
    duration: 2,
    status: "scheduled",
    jobType: "cleaning",
  },
  {
    id: "job-008",
    title: "Gas Valve Repair",
    customer: "David Rodriguez",
    techId: "tech-001",
    day: 5,
    startHour: 14,
    duration: 2,
    status: "scheduled",
    jobType: "repair",
  },
  {
    id: "job-009",
    title: "Chimney Sweep",
    customer: "New Customer",
    techId: "tech-004",
    day: 6, // Saturday
    startHour: 8,
    duration: 3,
    status: "scheduled",
    jobType: "service",
  },
];

// GET - Get schedule data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const techId = searchParams.get("techId");
    const weekStart = searchParams.get("weekStart"); // YYYY-MM-DD

    let filtered = [...scheduleJobs];

    // Filter by tech
    if (techId) {
      filtered = filtered.filter((j) => j.techId === techId);
    }

    // Filter by week (if provided)
    if (weekStart) {
      const startDate = new Date(weekStart);
      const dayOfWeek = startDate.getDay();
      
      filtered = filtered.map((job) => ({
        ...job,
        day: job.day,
      }));
    }

    return NextResponse.json({
      jobs: filtered,
      technicians,
    });
  } catch (err) {
    console.error("Failed to get schedule:", err);
    return NextResponse.json({ error: "Failed to get schedule" }, { status: 500 });
  }
}

// POST - Add a job to schedule
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const newJob: ScheduleJob = {
      id: body.id || `sched-${Date.now()}`,
      title: body.title || "New Job",
      customer: body.customer || "",
      techId: body.techId || "",
      day: body.day || 1,
      startHour: body.startHour || 9,
      duration: body.duration || 1,
      status: "scheduled",
      jobType: body.jobType || "service",
    };

    scheduleJobs.push(newJob);
    return NextResponse.json({ job: newJob }, { status: 201 });
  } catch (err) {
    console.error("Failed to create scheduled job:", err);
    return NextResponse.json({ error: "Failed to create scheduled job" }, { status: 500 });
  }
}

// PUT - Update scheduled job
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    const idx = scheduleJobs.findIndex((j) => j.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Scheduled job not found" }, { status: 404 });
    }

    scheduleJobs[idx] = {
      ...scheduleJobs[idx],
      ...updates,
    };

    return NextResponse.json({ job: scheduleJobs[idx] });
  } catch (err) {
    console.error("Failed to update scheduled job:", err);
    return NextResponse.json({ error: "Failed to update scheduled job" }, { status: 500 });
  }
}
