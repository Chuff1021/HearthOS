import { NextResponse } from "next/server";
import { getJobs, type Job } from "@/lib/jobs-store";

const jobs = getJobs();
let nextJobNum = 150;

// GET - List all jobs or search
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const techId = searchParams.get("techId");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "100");

    let filtered = [...jobs];

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
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete job:", err);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
