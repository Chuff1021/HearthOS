import { authorizeCron } from "@/lib/security/cron-access";
import { syncWebsiteInbox } from "@/lib/website-inbox/server";
import { websiteInboxConfig } from "@/lib/website-inbox/config";
import { reconcileWebsiteOrders } from "@/lib/website-orders/server";

export const maxDuration = 60;
export async function GET() {
  const accessDenied = await authorizeCron();
  if (accessDenied) return accessDenied;
  const headers = { "Cache-Control": "private, no-store" };
  if (!websiteInboxConfig()) return Response.json({ configured: false }, { headers });
  try {
    const [inbox, orders] = await Promise.allSettled([syncWebsiteInbox(), reconcileWebsiteOrders()]);
    if (inbox.status === "rejected" || orders.status === "rejected") throw new Error("Sync incomplete");
    return Response.json({ ...inbox.value, orders: orders.value }, { headers });
  }
  catch {
    console.warn("[website-inbox] Scheduled sync failed");
    return Response.json({ error: "Website sync unavailable" }, { status: 503, headers });
  }
}
