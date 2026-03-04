import { NextResponse } from "next/server";
import { readJsonFile, writeJsonFileWithBackup } from "@/lib/persist-json";

// Job types
export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "on_hold";
export type JobPriority = "low" | "normal" | "high" | "urgent";
export type JobType = "cleaning" | "inspection" | "repair" | "installation" | "service" | "estimate";

export interface Job {
  id: string;
  jobNumber: string;
  title: string;
  customerId: string;
  customerName: string;
  propertyAddress: string;
  fireplaceUnit?: {
    brand: string;
    model: string;
    nickname?: string;
    type?: string;
  };
  jobType: JobType;
  status: JobStatus;
  priority: JobPriority;
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  assignedTechs: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  totalAmount: number;
  notes?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const JOBS_FILE = "jobs.json";
let jobs: Job[] = readJsonFile<Job[]>(JOBS_FILE, []);
let nextJobNum =
  jobs
    .map((j) => Number((j.jobNumber || "").split("-").pop() || 0))
    .filter((n) => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 149) + 1;

function saveJobs() {
  writeJsonFileWithBackup(JOBS_FILE, jobs);
}

// Export jobs data for other modules
export function getJobs(): Job[] {
  return jobs;
}

// GET - List all jobs or search
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const techId = searchParams.get("techId");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "100");

    let filtered = [...jobs];

    if (id) {
      filtered = filtered.filter((j) => j.id === id);
    }

    // Filter by status
    if (status && status !== "all") {
      filtered = filtered.filter((j) => j.status === status);
    }

    // Filter by date (YYYY-MM-DD)
    if (date) {
      filtered = filtered.filter((j) => j.scheduledDate === date);
    }

    // Filter by tech
    if (techId) {
      filtered = filtered.filter((j) => 
        j.assignedTechs.some((t) => t.id === techId)
      );
    }

    // Search by customer name, address, or job number
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((j) =>
        j.customerName.toLowerCase().includes(q) ||
        j.propertyAddress.toLowerCase().includes(q) ||
        j.jobNumber.toLowerCase().includes(q) ||
        j.title.toLowerCase().includes(q)
      );
    }

    // Sort by scheduled date/time
    filtered.sort((a, b) => {
      const dateCompare = a.scheduledDate.localeCompare(b.scheduledDate);
      if (dateCompare !== 0) return dateCompare;
      return a.scheduledTimeStart.localeCompare(b.scheduledTimeStart);
    });

    return NextResponse.json({
      jobs: filtered.slice(0, limit),
      total: filtered.length,
    });
  } catch (err) {
    console.error("Failed to get jobs:", err);
    return NextResponse.json({ error: "Failed to get jobs" }, { status: 500 });
  }
}

// POST - Create a new job
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const nextIdNum = jobs
      .map((j) => Number(String(j.id).split('-').pop() || 0))
      .filter((n) => !Number.isNaN(n))
      .reduce((m, n) => Math.max(m, n), 0) + 1;

    const newJob: Job = {
      id: `job-${String(nextIdNum).padStart(3, "0")}`,
      jobNumber: `JOB-2026-${String(nextJobNum++).padStart(4, "0")}`,
      title: body.title || "New Job",
      customerId: body.customerId || "",
      customerName: body.customerName || "",
      propertyAddress: body.propertyAddress || "",
      fireplaceUnit: body.fireplaceUnit,
      jobType: body.jobType || "service",
      status: "scheduled",
      priority: body.priority || "normal",
      scheduledDate: body.scheduledDate || new Date().toISOString().split("T")[0],
      scheduledTimeStart: body.scheduledTimeStart || "09:00",
      scheduledTimeEnd: body.scheduledTimeEnd || "10:00",
      assignedTechs: body.assignedTechs || [],
      totalAmount: body.totalAmount || 0,
      notes: body.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    jobs.unshift(newJob);
    saveJobs();
    return NextResponse.json({ job: newJob }, { status: 201 });
  } catch (err) {
    console.error("Failed to create job:", err);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

// PUT - Update a job
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    jobs[idx] = {
      ...jobs[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveJobs();

    return NextResponse.json({ job: jobs[idx] });
  } catch (err) {
    console.error("Failed to update job:", err);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

// DELETE - Delete a job
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    jobs.splice(idx, 1);
    saveJobs();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete job:", err);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
