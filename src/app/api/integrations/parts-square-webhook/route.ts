import { createHmac, timingSafeEqual } from "node:crypto";
import { uuid } from "@/lib/parts-commerce/domain";
import { commerceDb } from "@/lib/parts-commerce/store";
import { commerceOrg, reconcileCommerce } from "@/lib/parts-commerce/server";
export const maxDuration = 300;
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 100000) return new Response(null, { status: 413 });
  const secret = process.env.PARTS_SQUARE_WEBHOOK_SIGNATURE_KEY,
    url = process.env.PARTS_SQUARE_WEBHOOK_URL;
  if (!secret || !url) return new Response(null, { status: 503 });
  const expected = createHmac("sha256", secret)
    .update(url + raw)
    .digest();
  const received = Buffer.from(
    request.headers.get("x-square-hmacsha256-signature") || "",
    "base64",
  );
  if (
    received.length !== expected.length ||
    !timingSafeEqual(expected, received)
  )
    return new Response(null, { status: 401 });
  // Retrieve authoritative Square state instead of trusting event order or event amounts.
  try {
    const org = commerceOrg(),
      sql = commerceDb(),
      event = JSON.parse(raw);
    const payment = event.data?.object?.payment,
      refund = event.data?.object?.refund;
    const id = payment?.reference_id;
    if (typeof id === "string" && uuid.test(id)) {
      const [row] =
        await sql`SELECT id FROM hearth_parts_orders WHERE org_id=${org} AND id=${id} AND (square_payment_id IS NULL OR square_payment_id=${payment.id})`;
      if (row) {
        // Recover a successful authorization whose original HTTP response timed out.
        await sql`UPDATE hearth_parts_orders SET square_payment_id=${payment.id} WHERE org_id=${org} AND id=${id} AND square_payment_id IS NULL AND square_order_id=${payment.order_id}`;
        await reconcileCommerce(org, id);
      }
    } else if (typeof refund?.payment_id === "string") {
      const [row] =
        await sql`SELECT id FROM hearth_parts_orders WHERE org_id=${org} AND square_payment_id=${refund.payment_id}`;
      if (row) await reconcileCommerce(org, row.id);
    }
    return Response.json({ ok: true });
  } catch {
    return new Response(null, { status: 503 });
  }
}
