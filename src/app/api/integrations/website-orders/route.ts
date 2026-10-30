import { OrderError, orderIdPattern, parseWebsiteOrder, verifyOrderRequest } from "@/lib/website-orders/domain";
import { createWebsiteCheckout, websiteOrderStatus } from "@/lib/website-orders/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const path = "/api/integrations/website-orders";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 64_000) throw new OrderError("Order request too large.", 413);
    const body = await request.text();
    if (body.length > 64_000) throw new OrderError("Order request too large.", 413);
    const url = new URL(request.url);
    if (!verifyOrderRequest(request.method, path + url.search, body, request.headers, process.env.HEARTHOS_WEBSITE_ORDER_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    if (request.method === "GET") {
      const id = url.searchParams.get("id") || "";
      if (!orderIdPattern.test(id)) throw new OrderError("Invalid order number.");
      return Response.json(await websiteOrderStatus(id), { headers });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new OrderError("Expected JSON order details.");
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { throw new OrderError("Invalid JSON order details."); }
    return Response.json(await createWebsiteCheckout(parseWebsiteOrder(payload)), { headers });
  } catch (error) {
    // Never expose provider credentials, SQL, or customer records through errors.
    return Response.json({ error: error instanceof OrderError ? error.message : "Checkout is temporarily unavailable." }, { status: error instanceof OrderError ? error.status : 503, headers });
  }
}
export const POST = handle;
export const GET = handle;
