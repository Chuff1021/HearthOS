import { authorizeCron } from "@/lib/security/cron-access";
import { commerceOrg, reconcileCommerce } from "@/lib/parts-commerce/server";
export const maxDuration = 300;
export async function GET() {
  const denied = await authorizeCron();
  if (denied) return denied;
  if (process.env.PARTS_COMMERCE_ENABLED !== "true")
    return Response.json({ enabled: false });
  try {
    return Response.json(await reconcileCommerce(commerceOrg()));
  } catch {
    return Response.json(
      { error: "Parts payment reconciliation needs review." },
      { status: 503 },
    );
  }
}
