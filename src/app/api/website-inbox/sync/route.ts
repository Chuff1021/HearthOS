import { authorizeCrmApi, requireCrmActor } from "@/lib/security/crm-access";
import { websiteInboxConfig } from "@/lib/website-inbox/config";
import { syncWebsiteInbox } from "@/lib/website-inbox/server";

export const maxDuration = 60;
export async function POST(request: Request) {
  const accessDenied = await authorizeCrmApi("/api/website-inbox/sync", "POST");
  if (accessDenied) return accessDenied;
  const headers = { "Cache-Control": "private, no-store" };
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403, headers });
  const actor = await requireCrmActor();
  const config = websiteInboxConfig();
  if (!config || config.orgId !== actor.orgId) return Response.json({ error: "Website connection is not configured" }, { status: 409, headers });
  try { return Response.json(await syncWebsiteInbox(), { headers }); }
  catch {
    console.warn("[website-inbox] Sync unavailable");
    return Response.json({ error: "Website connection could not be checked. Saved requests are still available." }, { status: 503, headers });
  }
}
