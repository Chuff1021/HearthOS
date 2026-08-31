import { NextResponse } from "next/server";
import { requirePermission, tenantErrorResponse } from "@/lib/tenant/context";

export async function GET() {
  try {
    await requirePermission("gabe:manage");
    return NextResponse.json({ ok: true, status: "ready", checkedAt: new Date().toISOString() });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: "Failed to check GABE test engine" }, { status: 500 });
  }
}
