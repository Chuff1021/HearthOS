import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/auth";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { authorizeApi } from "@/lib/tenant/api-authorization";
import {
  createJobFromProject,
  deleteProject,
  importProjectFromSource,
  listProjects,
  updateProject,
  type ProjectSourceType,
} from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireInternalUser() {
  if (!isClerkConfigured()) return { ok: true as const, userId: "local" };

  const { userId } = await auth();
  if (userId) return { ok: true as const, userId };

  return {
    ok: false as const,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

function cleanSourceType(value: unknown): ProjectSourceType | null {
  const type = String(value || "").trim().toLowerCase();
  return type === "invoice" || type === "estimate" ? type : null;
}

export async function GET() {
  const denied = await authorizeApi("jobs:read");
  if (denied) return denied;
  try {
    const access = await requireInternalUser();
    if (!access.ok) return access.response;

    const org = await getOrCreateDefaultOrg();
    const projects = await listProjects(org.id);

    const summary = {
      total: projects.length,
      partsNeeded: projects.filter((project) => project.stage === "parts_needed").length,
      partsOrdered: projects.filter((project) => project.partsStatus === "ordered" || project.partsStatus === "partial").length,
      ready: projects.filter((project) => project.stage === "ready").length,
      scheduled: projects.filter((project) => project.stage === "scheduled").length,
    };

    return NextResponse.json({ projects, summary });
  } catch (err) {
    console.error("Projects GET failed:", err);
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await authorizeApi("jobs:write");
  if (denied) return denied;
  try {
    const access = await requireInternalUser();
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const org = await getOrCreateDefaultOrg();

    if (body?.action === "schedule_job") {
      const id = String(body?.id || "").trim();
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const result = await createJobFromProject(org.id, id, {
        scheduledDate: body?.scheduledDate,
        scheduledTimeStart: body?.scheduledTimeStart,
        scheduledTimeEnd: body?.scheduledTimeEnd,
      });
      if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      return NextResponse.json(result, { status: 201 });
    }

    const sourceType = cleanSourceType(body?.sourceType);
    const sourceId = String(body?.sourceId || "").trim();
    if (!sourceType || !sourceId) {
      return NextResponse.json({ error: "sourceType and sourceId are required" }, { status: 400 });
    }

    const project = await importProjectFromSource(org.id, sourceType, sourceId);
    if (!project) return NextResponse.json({ error: "Source document not found" }, { status: 404 });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("Projects POST failed:", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await authorizeApi("jobs:write");
  if (denied) return denied;
  try {
    const access = await requireInternalUser();
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const org = await getOrCreateDefaultOrg();
    const project = await updateProject(org.id, id, body);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    return NextResponse.json({ project });
  } catch (err) {
    console.error("Projects PUT failed:", err);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await authorizeApi("jobs:write");
  if (denied) return denied;
  try {
    const access = await requireInternalUser();
    if (!access.ok) return access.response;

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const org = await getOrCreateDefaultOrg();
    const deleted = await deleteProject(org.id, id);
    if (!deleted) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Projects DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
