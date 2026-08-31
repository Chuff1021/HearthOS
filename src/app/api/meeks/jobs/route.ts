import { NextRequest, NextResponse } from "next/server";
import { createJobRecord } from "@/lib/job-store";
import {
  createMeeksJob,
  deleteMeeksJob,
  listEnrichedMeeksJobs,
  updateMeeksJob,
  type MeeksAttachment,
  type MeeksWorkType,
} from "@/lib/meeks-job-store";
import { getMeeksApiAccess, getMeeksInternalAccess } from "@/lib/meeks-auth";
import { getTechs } from "@/app/api/techs/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const MAX_PO_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ALLOWED_PO_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function portalToken() {
  return process.env.MEEKS_PORTAL_TOKEN?.trim() || "";
}

function requirePortalAccess(request: NextRequest, body?: any) {
  const token = portalToken();
  if (!token) return null;
  const provided =
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("x-meeks-token") ||
    body?.token ||
    "";
  return provided === token ? null : NextResponse.json({ error: "Meeks portal token required" }, { status: 401 });
}

function cleanText(value: unknown, fallback = "") {
  return String(value || fallback).trim();
}

function cleanWorkType(value: unknown): MeeksWorkType {
  const next = cleanText(value).toLowerCase();
  if (next === "setup" || next === "service_warranty" || next === "repair" || next === "install") return next;
  return "install";
}

function workTypeLabel(type: MeeksWorkType) {
  if (type === "service_warranty") return "Service / Warranty";
  if (type === "setup") return "Setup";
  if (type === "repair") return "Repair";
  return "Install";
}

function jobTypeForMeeks(type: MeeksWorkType) {
  if (type === "install" || type === "setup") return "installation";
  if (type === "repair") return "repair";
  return "service";
}

function priorityForMeeks(value: unknown): "normal" | "high" | "urgent" {
  const priority = cleanText(value).toLowerCase();
  if (priority === "high" || priority === "urgent") return priority;
  return "normal";
}

function cleanPoAttachment(value: unknown): MeeksAttachment | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<MeeksAttachment>;
  const fileName = cleanText(raw.fileName, "PO attachment");
  const contentType = cleanText(raw.contentType, "application/octet-stream").toLowerCase();
  const dataUrl = cleanText(raw.dataUrl);
  const size = Number(raw.size || 0);

  if (!fileName || !dataUrl) return undefined;
  if (!ALLOWED_PO_ATTACHMENT_TYPES.has(contentType)) {
    throw new Error("PO attachment must be a PDF or image file.");
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_PO_ATTACHMENT_BYTES) {
    throw new Error("PO attachment must be 3 MB or smaller.");
  }
  if (!dataUrl.startsWith(`data:${contentType};base64,`)) {
    throw new Error("PO attachment could not be read.");
  }

  return {
    id: cleanText(raw.id) || crypto.randomUUID(),
    fileName,
    contentType,
    size,
    dataUrl,
    uploadedAt: cleanText(raw.uploadedAt) || new Date().toISOString(),
  };
}

function fullAddress(body: any) {
  return [
    cleanText(body.address),
    cleanText(body.lotNumber) ? `Lot ${cleanText(body.lotNumber)}` : "",
    [cleanText(body.city), cleanText(body.state), cleanText(body.zip)].filter(Boolean).join(", ").replace(/, (\w{2}|\d{5})$/, " $1"),
  ]
    .filter(Boolean)
    .join(", ");
}

export async function GET(request: NextRequest) {
  try {
    const access = await getMeeksApiAccess();
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

    // The shared token protects partner portal links. Signed-in HearthOS staff
    // must be able to review the same queue from the internal Schedule page.
    if (!access.isInternal) {
      const denied = requirePortalAccess(request);
      if (denied) return denied;
    }

    const status = request.nextUrl.searchParams.get("status");
    const jobs = await listEnrichedMeeksJobs();
    const filtered = status && status !== "all"
      ? jobs.filter((job) => job.status === status)
      : jobs;

    const summary = {
      total: filtered.length,
      requested: filtered.filter((job) => job.status === "requested").length,
      scheduled: filtered.filter((job) => job.status === "scheduled").length,
      completed: filtered.filter((job) => job.status === "completed").length,
    };

    return NextResponse.json({ jobs: filtered, summary });
  } catch (err) {
    console.error("Meeks jobs GET failed:", err);
    return NextResponse.json({ error: "Failed to load Meeks jobs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body?.action === "move_to_calendar") {
      const access = await getMeeksInternalAccess();
      if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

      const id = cleanText(body.id);
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const jobs = await listEnrichedMeeksJobs();
      const requestJob = jobs.find((job) => job.id === id);
      if (!requestJob) return NextResponse.json({ error: "Meeks request not found" }, { status: 404 });

      if (requestJob.linkedJobId) {
        return NextResponse.json({ error: "This Meeks request is already on the main calendar" }, { status: 409 });
      }

      const activeTechs = getTechs();
      const assignedTechIds = Array.isArray(body.assignedTechIds) ? body.assignedTechIds.map(String) : [];
      const assignedTechs = activeTechs
        .filter((tech) => assignedTechIds.includes(tech.id))
        .map((tech) => ({ id: tech.id, name: tech.name, color: tech.color }));
      const scheduledDate = cleanText(body.scheduledDate, requestJob.requestedDate);
      const scheduledTimeStart = cleanText(body.scheduledTimeStart, "09:00").slice(0, 5);
      const scheduledTimeEnd = cleanText(body.scheduledTimeEnd, "11:00").slice(0, 5);
      const label = workTypeLabel(requestJob.workType);

      const hearthJob = await createJobRecord({
        title: `Meeks ${label}${requestJob.appliance ? ` - ${requestJob.appliance}` : ""}`,
        customerId: `meeks-${requestJob.id}`,
        customerName: `Meeks - ${requestJob.customerName}`,
        propertyAddress: fullAddress(requestJob),
        jobType: jobTypeForMeeks(requestJob.workType) as any,
        priority: requestJob.priority,
        scheduledDate,
        scheduledTimeStart,
        scheduledTimeEnd,
        assignedTechs,
        notes: [
          `Meeks request ${requestJob.requestNumber}`,
          requestJob.poNumber ? `PO number: ${requestJob.poNumber}` : "",
          requestJob.poAttachment ? `PO attachment: ${requestJob.poAttachment.fileName}` : "",
          requestJob.lotNumber ? `Lot number: ${requestJob.lotNumber}` : "",
          `Work type: ${label}`,
          requestJob.requestedTimeWindow ? `Requested window: ${requestJob.requestedTimeWindow}` : "",
          requestJob.customerPhone ? `Customer phone: ${requestJob.customerPhone}` : "",
          requestJob.customerEmail ? `Customer email: ${requestJob.customerEmail}` : "",
          requestJob.accessNotes ? `Access notes: ${requestJob.accessNotes}` : "",
          requestJob.notes ? `Meeks notes: ${requestJob.notes}` : "",
        ].filter(Boolean).join("\n"),
        linkedDocumentNumber: requestJob.poNumber || undefined,
      });

      const updated = await updateMeeksJob(requestJob.id, {
        status: "scheduled",
        linkedJobId: hearthJob.id,
        linkedJobNumber: hearthJob.jobNumber,
        scheduledDate,
        scheduledTimeStart,
        scheduledTimeEnd,
        assignedTechs,
      });

      return NextResponse.json({ request: updated, job: hearthJob }, { status: 201 });
    }

    const denied = requirePortalAccess(request, body);
    if (denied) return denied;

    const access = await getMeeksApiAccess();
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

    const customerName = cleanText(body.customerName);
    const address = cleanText(body.address);
    const requestedDate = cleanText(body.requestedDate);
    if (!customerName || !address || !requestedDate) {
      return NextResponse.json({ error: "customerName, address, and requestedDate are required" }, { status: 400 });
    }

    const requestJob = await createMeeksJob({
      customerName,
      customerPhone: cleanText(body.customerPhone) || undefined,
      customerEmail: cleanText(body.customerEmail) || undefined,
      poNumber: cleanText(body.poNumber) || undefined,
      address,
      lotNumber: cleanText(body.lotNumber) || undefined,
      city: cleanText(body.city) || undefined,
      state: cleanText(body.state) || undefined,
      zip: cleanText(body.zip) || undefined,
      workType: cleanWorkType(body.workType),
      appliance: cleanText(body.appliance) || undefined,
      requestedDate,
      requestedTimeWindow: cleanText(body.requestedTimeWindow) || undefined,
      priority: priorityForMeeks(body.priority),
      notes: cleanText(body.notes) || undefined,
      accessNotes: cleanText(body.accessNotes) || undefined,
      poAttachment: cleanPoAttachment(body.poAttachment),
      status: "requested",
    });

    return NextResponse.json({ request: requestJob }, { status: 201 });
  } catch (err) {
    console.error("Meeks jobs POST failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save Meeks job" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await getMeeksInternalAccess();
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

    const body = await request.json().catch(() => ({}));
    const id = cleanText(body.id);
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const requestJob = await updateMeeksJob(id, body);
    if (!requestJob) return NextResponse.json({ error: "Meeks request not found" }, { status: 404 });
    return NextResponse.json({ request: requestJob });
  } catch (err) {
    console.error("Meeks jobs PUT failed:", err);
    return NextResponse.json({ error: "Failed to update Meeks job" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await getMeeksApiAccess();
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

    const portalDenied = requirePortalAccess(request);
    if (portalDenied) {
      if (!access.isInternal) return portalDenied;
    }

    const id = cleanText(request.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const deleted = await deleteMeeksJob(id);
    if (!deleted) return NextResponse.json({ error: "Meeks request not found" }, { status: 404 });

    return NextResponse.json({
      success: true,
      deleted,
      linkedJobPreserved: Boolean(deleted.linkedJobId),
    });
  } catch (err) {
    console.error("Meeks jobs DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete Meeks job" }, { status: 500 });
  }
}
