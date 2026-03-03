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

// Seed jobs data
const seedJobs: Job[] = [
  {
    id: "job-001",
    jobNumber: "JOB-2026-0142",
    title: "Annual Cleaning & Inspection",
    customerId: "cust-001",
    customerName: "Linda Martinez",
    propertyAddress: "1234 Oak Street, Denver, CO 80202",
    fireplaceUnit: { brand: "Regency", model: "HZ40E", nickname: "Living Room", type: "Gas" },
    jobType: "cleaning",
    status: "completed",
    priority: "normal",
    scheduledDate: "2026-02-25",
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "11:00",
    assignedTechs: [{ id: "tech-001", name: "Mike Johnson", color: "#2563EB" }],
    totalAmount: 285.00,
    completedAt: "2026-02-25T10:30:00Z",
    createdAt: "2026-02-20T10:00:00Z",
    updatedAt: "2026-02-25T10:30:00Z",
  },
  {
    id: "job-002",
    jobNumber: "JOB-2026-0143",
    title: "Gas Fireplace Installation",
    customerId: "cust-002",
    customerName: "Robert Chen",
    propertyAddress: "5678 Maple Ave, Boulder, CO 80301",
    fireplaceUnit: { brand: "Napoleon", model: "GVFL60", nickname: "Basement", type: "Gas Insert" },
    jobType: "installation",
    status: "in_progress",
    priority: "high",
    scheduledDate: "2026-02-25",
    scheduledTimeStart: "10:00",
    scheduledTimeEnd: "16:00",
    assignedTechs: [
      { id: "tech-002", name: "Sarah Williams", color: "#98CD00" },
      { id: "tech-003", name: "Tom Davis", color: "#FF4400" },
    ],
    totalAmount: 4200.00,
    notes: "New construction - gas line already installed",
    createdAt: "2026-02-18T09:00:00Z",
    updatedAt: "2026-02-25T10:00:00Z",
  },
  {
    id: "job-003",
    jobNumber: "JOB-2026-0144",
    title: "Pilot Light Repair",
    customerId: "cust-003",
    customerName: "Patricia Williams",
    propertyAddress: "910 Pine Road, Lakewood, CO 80226",
    fireplaceUnit: { brand: "Heat & Glo", model: "SLR-FT", nickname: "Master Bedroom", type: "Gas" },
    jobType: "repair",
    status: "scheduled",
    priority: "urgent",
    scheduledDate: "2026-02-26",
    scheduledTimeStart: "14:00",
    scheduledTimeEnd: "15:30",
    assignedTechs: [{ id: "tech-001", name: "Mike Johnson", color: "#2563EB" }],
    totalAmount: 185.00,
    notes: "Customer mentioned pilot light keeps going out",
    createdAt: "2026-02-24T08:00:00Z",
    updatedAt: "2026-02-24T08:00:00Z",
  },
  {
    id: "job-004",
    jobNumber: "JOB-2026-0145",
    title: "Wood Stove Inspection",
    customerId: "cust-004",
    customerName: "James Thompson",
    propertyAddress: "2345 Elm Blvd, Aurora, CO 80012",
    fireplaceUnit: { brand: "Vermont Castings", model: "Defiant", nickname: "Den", type: "Wood" },
    jobType: "inspection",
    status: "scheduled",
    priority: "low",
    scheduledDate: "2026-02-26",
    scheduledTimeStart: "11:00",
    scheduledTimeEnd: "12:00",
    assignedTechs: [],
    totalAmount: 150.00,
    createdAt: "2026-02-22T10:00:00Z",
    updatedAt: "2026-02-22T10:00:00Z",
  },
  {
    id: "job-005",
    jobNumber: "JOB-2026-0146",
    title: "Pellet Stove Service",
    customerId: "cust-005",
    customerName: "Susan Park",
    propertyAddress: "6789 Birch Lane, Littleton, CO 80120",
    fireplaceUnit: { brand: "Harman", model: "P68", nickname: "Family Room", type: "Pellet" },
    jobType: "service",
    status: "cancelled",
    priority: "normal",
    scheduledDate: "2026-02-25",
    scheduledTimeStart: "13:00",
    scheduledTimeEnd: "15:00",
    assignedTechs: [{ id: "tech-004", name: "Chris Lee", color: "#2563EB" }],
    totalAmount: 0,
    notes: "Customer cancelled - rescheduled to next week",
    createdAt: "2026-02-21T14:00:00Z",
    updatedAt: "2026-02-24T09:00:00Z",
  },
  {
    id: "job-006",
    jobNumber: "JOB-2026-0147",
    title: "Fireplace Estimate",
    customerId: "cust-006",
    customerName: "Michael Davis",
    propertyAddress: "3456 Cedar Court, Arvada, CO 80002",
    fireplaceUnit: { brand: "Napoleon", model: "Lexington", nickname: "Living Room", type: "Gas" },
    jobType: "estimate",
    status: "scheduled",
    priority: "normal",
    scheduledDate: "2026-02-26",
    scheduledTimeStart: "09:00",
    scheduledTimeEnd: "10:00",
    assignedTechs: [{ id: "tech-002", name: "Sarah Williams", color: "#98CD00" }],
    totalAmount: 0,
    createdAt: "2026-02-23T11:00:00Z",
    updatedAt: "2026-02-23T11:00:00Z",
  },
  {
    id: "job-007",
    jobNumber: "JOB-2026-0148",
    title: "Gas Valve Replacement",
    customerId: "cust-007",
    customerName: "Karen Wilson",
    propertyAddress: "7890 Spruce Way, Westminster, CO 80031",
    fireplaceUnit: { brand: "Valor", model: "H4", nickname: "Living Room", type: "Gas" },
    jobType: "repair",
    status: "scheduled",
    priority: "high",
    scheduledDate: "2026-02-26",
    scheduledTimeStart: "15:00",
    scheduledTimeEnd: "16:30",
    assignedTechs: [{ id: "tech-003", name: "Tom Davis", color: "#FF4400" }],
    totalAmount: 425.00,
    notes: "Parts already ordered - arriving tomorrow AM",
    createdAt: "2026-02-24T15:00:00Z",
    updatedAt: "2026-02-24T15:00:00Z",
  },
  {
    id: "job-008",
    jobNumber: "JOB-2026-0149",
    title: "Chimney Sweep & Cap Install",
    customerId: "cust-008",
    customerName: "David Rodriguez",
    propertyAddress: "1111 Mountain Rd, Vail, CO 81657",
    fireplaceUnit: { brand: "Majestic", model: "SL-600", nickname: "Lobby", type: "Gas" },
    jobType: "service",
    status: "scheduled",
    priority: "normal",
    scheduledDate: "2026-02-27",
    scheduledTimeStart: "08:00",
    scheduledTimeEnd: "12:00",
    assignedTechs: [
      { id: "tech-001", name: "Mike Johnson", color: "#2563EB" },
      { id: "tech-004", name: "Chris Lee", color: "#2563EB" },
    ],
    totalAmount: 550.00,
    createdAt: "2026-02-20T10:00:00Z",
    updatedAt: "2026-02-20T10:00:00Z",
  },
];

const JOBS_FILE = "jobs.json";
let jobs: Job[] = readJsonFile<Job[]>(JOBS_FILE, [...seedJobs]);
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
    
    const newJob: Job = {
      id: `job-${String(jobs.length + 1).padStart(3, "0")}`,
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
