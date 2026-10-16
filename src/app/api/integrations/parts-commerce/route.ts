import { verifyOrderRequest } from "@/lib/website-orders/domain";
import { CommerceError } from "@/lib/parts-commerce/domain";
import {
  authorizeQuote,
  catalog,
  commerceOrg,
  orderStatus,
  quoteCart,
  redeemQuote,
  recordPartsInterest,
} from "@/lib/parts-commerce/server";

export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
  let checkoutInput:
    { action?: string; quoteId?: string; session?: string } | undefined;
  try {
    const raw = await request.text();
    if (raw.length > 32000) throw new CommerceError("Request too large.", 413);
    const url = new URL(request.url),
      path = url.pathname + url.search;
    if (
      !verifyOrderRequest(
        request.method,
        path,
        raw,
        request.headers,
        process.env.HEARTHOS_WEBSITE_ORDER_SECRET,
      )
    )
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    commerceOrg();
    if (request.method === "GET")
      return Response.json(await catalog(url.searchParams.get("after") || ""), {
        headers,
      });
    const input = JSON.parse(raw);
    checkoutInput = input;
    const session = input.session || "";
    if (!/^[a-f0-9]{64}$/.test(session))
      throw new CommerceError("Checkout session missing.", 401);
    const result =
      input.action === "interest"
        ? await recordPartsInterest(input.items)
        : input.action === "quote"
          ? await quoteCart(input, session)
          : input.action === "authorize"
            ? await authorizeQuote(input, session)
            : input.action === "redeem"
              ? await redeemQuote(input.quoteId, session)
              : input.action === "status"
                ? await orderStatus(input.id, session)
                : null;
    if (!result) throw new CommerceError("Unknown checkout action.");
    return Response.json(result, { headers });
  } catch (e) {
    let processingUnknown = false;
    if (checkoutInput?.action === "authorize") {
      try {
        const status = await orderStatus(
          checkoutInput.quoteId || "",
          checkoutInput.session || "",
        );
        processingUnknown = ["pending", "authorized", "paid"].includes(
          status.status,
        );
      } catch (statusError) {
        processingUnknown = !(
          statusError instanceof CommerceError && statusError.status === 404
        );
      }
    }
    return Response.json(
      {
        processingUnknown,
        error:
          e instanceof CommerceError
            ? e.message
            : "Parts service temporarily unavailable.",
      },
      { status: e instanceof CommerceError ? e.status : 503, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
