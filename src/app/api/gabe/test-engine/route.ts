import { authorizeCrmApi } from "@/lib/security/crm-access";
import { NextResponse } from "next/server";

export async function GET() {
  const accessDenied = await authorizeCrmApi("/api/gabe/test-engine", "GET");
  if (accessDenied) return accessDenied;
  return NextResponse.json({
    ok: true,
    status: "ready",
    checkedAt: new Date().toISOString(),
  });
}
