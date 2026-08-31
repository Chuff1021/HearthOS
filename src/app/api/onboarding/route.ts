import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, onboardingProgress, organizations } from "@/db";
import { getIntegrationConnection } from "@/lib/integrations/store";
import { requirePermission, tenantErrorResponse } from "@/lib/tenant/context";

const STEPS = ["company", "quickbooks", "payments", "team", "scheduling", "complete"] as const;
type Step = (typeof STEPS)[number];

function isStep(value: unknown): value is Step {
  return STEPS.includes(value as Step);
}

export async function GET() {
  try {
    const context = await requirePermission("organization:read");
    const [progress] = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.orgId, context.orgId))
      .limit(1);
    const [quickbooks, square] = await Promise.all([
      getIntegrationConnection(context.orgId, "quickbooks"),
      getIntegrationConnection(context.orgId, "square"),
    ]);
    return NextResponse.json({
      status: progress?.status || context.organization.onboardingStatus,
      currentStep: progress?.currentStep || "company",
      completedSteps: Array.isArray(progress?.completedSteps) ? progress.completedSteps : [],
      checklist: progress?.checklist || {},
      integrations: {
        quickbooks: quickbooks?.status || (context.organization.qbConnected ? "legacy_connected" : "not_connected"),
        square: square?.status || "not_connected",
      },
      steps: STEPS,
    });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to load onboarding" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requirePermission("organization:manage");
    const body = await request.json();
    const currentStep = isStep(body.currentStep) ? body.currentStep : "company";
    const completedStep = isStep(body.completedStep) ? body.completedStep : null;
    const [existing] = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.orgId, context.orgId))
      .limit(1);
    const completed = new Set(Array.isArray(existing?.completedSteps) ? existing.completedSteps as string[] : []);
    if (completedStep) completed.add(completedStep);
    const isComplete = currentStep === "complete";

    if (body.company && typeof body.company === "object") {
      const currentSettings = context.organization.settings && typeof context.organization.settings === "object"
        ? context.organization.settings as Record<string, unknown>
        : {};
      await db
        .update(organizations)
        .set({
          name: String(body.company.name || context.organization.name).trim().slice(0, 150),
          phone: String(body.company.phone || context.organization.phone || "").trim() || null,
          email: String(body.company.email || context.organization.email || "").trim().toLowerCase() || null,
          timezone: String(body.company.timezone || context.organization.timezone || "America/Chicago"),
          settings: { ...currentSettings, company: body.company },
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, context.orgId));
    }

    const values = {
      status: isComplete ? "completed" : "in_progress",
      currentStep,
      completedSteps: [...completed],
      checklist: body.checklist && typeof body.checklist === "object"
        ? { ...(existing?.checklist as Record<string, unknown> || {}), ...body.checklist }
        : existing?.checklist || {},
      startedAt: existing?.startedAt || new Date(),
      completedAt: isComplete ? new Date() : null,
      updatedAt: new Date(),
    };
    await db
      .insert(onboardingProgress)
      .values({ orgId: context.orgId, ...values })
      .onConflictDoUpdate({ target: onboardingProgress.orgId, set: values });
    await db
      .update(organizations)
      .set({ onboardingStatus: isComplete ? "active" : "in_progress", updatedAt: new Date() })
      .where(and(eq(organizations.id, context.orgId)));

    return NextResponse.json({ ok: true, status: values.status, currentStep, completedSteps: values.completedSteps });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to save onboarding" }, { status: 500 });
  }
}
