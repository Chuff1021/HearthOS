import { authorizeCrmApi, requireCrmActor } from "@/lib/security/crm-access";

export async function GET() {
  const accessDenied = await authorizeCrmApi("/api/access", "GET");
  if (accessDenied) return accessDenied;
  const actor = await requireCrmActor();
  return Response.json(
    { userId: actor.clerkUserId, employeeId: actor.employeeId, role: actor.role, name: actor.name },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
