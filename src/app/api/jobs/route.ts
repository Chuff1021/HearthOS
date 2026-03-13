import { NextResponse } from "next/server";
import {
  createJobRecord,
  deleteJobRecord,
  listJobs,
  updateJobRecord,
} from "@/lib/job-store";
import type { Job, JobType, JobStatus, JobPriority } from "@/lib/job-store";

export type { Job, JobType, JobStatus, JobPriority };

export async function getJobs(): Promise<Job[]> {
  return listJobs();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const techId = searchParams.get("techId");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "1000", 10);

    let filtered = await listJobs();

    if (id) {
      filtered = filtered.filter((job) => job.id === id);
    }

    if (status && status !== "all") {
      filtered = filtered.filter((job) => job.status === status);
    }

    if (date) {
      filtered = filtered.filter((job) => job.scheduledDate === date);
    }

    if (techId) {
      filtered = filtered.filter((job) => job.assignedTechs.some((tech) => tech.id === techId));
    }

    if (search) {
      const query = search.toLowerCase();
      filtered = filtered.filter((job) =>
        job.customerName.toLowerCase().includes(query) ||
        job.propertyAddress.toLowerCase().includes(query) ||
        job.jobNumber.toLowerCase().includes(query) ||
        job.title.toLowerCase().includes(query)
      );
    }

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newJob = await createJobRecord({
      title: body.title,
      customerId: body.customerId,
      customerName: body.customerName,
      propertyAddress: body.propertyAddress,
      linkedInvoiceId: body.linkedInvoiceId,
      linkedEstimateId: body.linkedEstimateId,
      linkedDocumentNumber: body.linkedDocumentNumber,
      fireplaceUnit: body.fireplaceUnit,
      jobType: body.jobType || "service",
      status: "scheduled",
      priority: body.priority || "normal",
      scheduledDate: body.scheduledDate,
      scheduledTimeStart: body.scheduledTimeStart,
      scheduledTimeEnd: body.scheduledTimeEnd,
      assignedTechs: body.assignedTechs || [],
      totalAmount: body.totalAmount || 0,
      notes: body.notes,
    });

    return NextResponse.json({ job: newJob }, { status: 201 });
  } catch (err) {
    console.error("Failed to create job:", err);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    const job = await updateJobRecord(id, updates);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (err) {
    console.error("Failed to update job:", err);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    const deleted = await deleteJobRecord(id);
    if (!deleted) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete job:", err);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
