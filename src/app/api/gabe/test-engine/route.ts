import { NextResponse } from "next/server";
import { tenantErrorResponse } from "@/lib/tenant/context";
import { requireOrganizationFeature } from "@/lib/tenant/feature-access";

export async function GET() {
  try {
    await requireOrganizationFeature("gabeAudit", "gabe:manage");
    return NextResponse.json({ ok: true, status: "ready", checkedAt: new Date().toISOString() });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to check GABE test engine" }, { status: 500 });
  }
}
