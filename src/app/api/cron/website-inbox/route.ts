import { authorizeCron } from "@/lib/security/cron-access";
import { syncWebsiteInbox } from "@/lib/website-inbox/server";
import { websiteInboxConfig } from "@/lib/website-inbox/config";

export const maxDuration = 60;
export async function GET() {
  const accessDenied = await authorizeCron();
  if (accessDenied) return accessDenied;
  const headers = { "Cache-Control": "private, no-store" };
  if (!websiteInboxConfig()) return Response.json({ configured: false }, { headers });
  try { return Response.json(await syncWebsiteInbox(), { headers }); }
  catch {
    console.warn("[website-inbox] Scheduled sync failed");
    return Response.json({ error: "Website sync unavailable" }, { status: 503, headers });
  }
}
