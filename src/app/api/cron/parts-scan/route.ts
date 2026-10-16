import { authorizeCron } from "@/lib/security/cron-access";
import { commerceOrg } from "@/lib/parts-commerce/server";
import { runScanBatch } from "@/lib/parts-commerce/scanner";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() {
  const accessDenied = await authorizeCron();
  if (accessDenied) return accessDenied;
  if (process.env.PARTS_COMMERCE_ENABLED !== "true")
    return Response.json({ enabled: false });
  try {
    return Response.json(await runScanBatch(commerceOrg(), 260000));
  } catch {
    return Response.json(
      { error: "Parts scanning needs review. Check the parts dashboard." },
      { status: 503 },
    );
  }
}
