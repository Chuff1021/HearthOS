import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { websiteInboxConfig } from "@/lib/website-inbox/config";
import { squareOrganization } from "@/lib/invoices/square-capture-intent";
import { sendSmtpEmail } from "@/lib/email/smtp";
import {
  CommerceError,
  assertPurchasable,
  hash,
  parseAddress,
  parseCart,
  text,
  uuid,
  type Quote,
  type Address,
  type CartLine,
} from "./domain";
import {
  commerceDb,
  effectiveOffer,
  outbox,
  publishOrder,
  type OrderRow,
  type PartRow,
} from "./store";
import { refreshCart } from "./scanner";
import {
  createPartsSquare,
  createSupplierShipping,
  taxJarQuote,
  type SquarePayment,
} from "./providers";

export function commerceOrg() {
  const config = websiteInboxConfig();
  if (!config || process.env.PARTS_COMMERCE_ENABLED !== "true")
    throw new CommerceError(
      "Online parts ordering is being connected. You can request a quote by email.",
      503,
    );
  return config.orgId;
}
async function squareService() {
  const org = commerceOrg();
  const {
    SQUARE_ACCESS_TOKEN: accessToken,
    SQUARE_LOCATION_ID: locationId,
    SQUARE_ENVIRONMENT: environment,
  } = process.env;
  if (
    !accessToken ||
    !locationId ||
    !["production", "sandbox"].includes(environment || "") ||
    (await squareOrganization()) !== org
  )
    throw new CommerceError("Payment setup needs review.", 503);
  return createPartsSquare({
    accessToken,
    locationId,
    environment: environment as "production" | "sandbox",
  });
}
export function paymentSetupReady() {
  return (
    process.env.PARTS_PAYMENTS_ENABLED === "true" &&
    process.env.PARTS_TAX_SETTINGS_VERIFIED === "true" &&
    Boolean(process.env.TAXJAR_API_TOKEN) &&
    Boolean(process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID) &&
    Boolean(process.env.SQUARE_LOCATION_ID) &&
    (process.env.SQUARE_ENVIRONMENT !== "production" ||
      Boolean(
        process.env.PARTS_SQUARE_WEBHOOK_SIGNATURE_KEY &&
        process.env.PARTS_SQUARE_WEBHOOK_URL,
      ))
  );
}
export function checkoutReady() {
  return paymentSetupReady() && process.env.PARTS_SHIPPING_VERIFIED === "true";
}
function requireCheckout() {
  if (!checkoutReady())
    throw new CommerceError(
      "Please request an online quote. We’ll email your confirmed shipping and checkout details.",
      503,
    );
}
export async function catalog(after = "", limit = 2000) {
  const org = commerceOrg(),
    sql = commerceDb();
  const rows = await sql<
    PartRow[]
  >`SELECT * FROM hearth_parts WHERE org_id=${org} AND key>${after} ORDER BY key LIMIT ${Math.min(limit, 2000)}`;
  return {
    items: rows.map((row) => {
      const offer = effectiveOffer(row);
      return {
        key: row.key,
        sku: row.sku,
        sourceId: row.source_id,
        slug: row.catalog.slug,
        priceCents: offer?.priceCents,
        listCents: offer?.listCents,
        quantity: offer?.quantity ?? null,
        status:
          row.override?.status ||
          (offer && Date.now() - Date.parse(offer.checkedAt) < 86400000
            ? offer.status
            : "unverified"),
        availability:
          row.override?.message ||
          offer?.availability ||
          "Availability has not been verified",
        checkedAt: offer?.checkedAt || null,
        canPurchase:
          checkoutReady() &&
          row.pilot &&
          !row.duplicate &&
          offer?.status === "available" &&
          !offer.requiresOptions,
        ...(row.catalog.discovered ? { catalog: row.catalog } : {}),
      };
    }),
    next:
      rows.length === Math.min(limit, 2000) ? rows[rows.length - 1].key : null,
  };
}
async function pricedLines(org: string, cart: CartLine[], requirePilot = true) {
  const rows = await refreshCart(
    org,
    cart.map((l) => l.key),
  );
  return cart.map((line) => {
    const row = rows.find((r) => r.key === line.key)!;
    if ((requirePilot && !row.pilot) || row.duplicate)
      throw new CommerceError(`${row.sku} needs an online quote.`, 409);
    const offer = effectiveOffer(row);
    if (!offer) throw new CommerceError("Part has not been verified.", 409);
    assertPurchasable(offer, line.quantity);
    return {
      ...line,
      sku: offer.sku,
      name: String(row.catalog.name || offer.name),
      unitPriceCents: offer.priceCents,
      sourceId: offer.sourceId,
      offerHash: offer.hash,
    };
  });
}
export async function quoteCart(
  input: {
    items: unknown;
    address: Record<string, unknown>;
    shippingId?: string;
  },
  session: string,
) {
  requireCheckout();
  const org = commerceOrg(),
    sql = commerceDb();
  const address = parseAddress(input.address),
    cart = parseCart(input.items);
  const [rate] =
    await sql`SELECT count(*)::int AS count FROM hearth_parts_quotes WHERE org_id=${org} AND session_hash=${hash(session)} AND created_at>now()-interval '1 minute'`;
  if (rate.count >= 5)
    throw new CommerceError(
      "Please wait a minute before requesting another quote.",
      429,
    );
  const lines = await pricedLines(org, cart);
  const shipping = await createSupplierShipping()(lines, address);
  const selected = input.shippingId
    ? shipping.find((o) => o.id === input.shippingId)
    : shipping.reduce((a, b) => (a.amountCents <= b.amountCents ? a : b));
  if (!selected)
    throw new CommerceError("Choose an available shipping service.", 409);
  const tax = await taxJarQuote(lines, address, selected.amountCents);
  const quote: Quote = {
    id: randomUUID(),
    address,
    lines,
    shipping: selected,
    taxCents: tax.amountCents,
    totalCents:
      lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0) +
      selected.amountCents +
      tax.amountCents,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
  };
  await sql`INSERT INTO hearth_parts_quotes(org_id,id,session_hash,snapshot,expires_at) VALUES(${org},${quote.id},${hash(session)},${sql.json(quote)},${quote.expiresAt})`;
  return {
    quote,
    shipping,
    square: {
      applicationId: process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID,
      locationId: process.env.SQUARE_LOCATION_ID,
      environment: process.env.SQUARE_ENVIRONMENT,
    },
  };
}
export async function readQuote(id: string, session: string) {
  if (!uuid.test(id)) throw new CommerceError("Invalid quote.");
  const sql = commerceDb(),
    org = commerceOrg();
  const [row] =
    await sql`SELECT snapshot FROM hearth_parts_quotes WHERE org_id=${org} AND id=${id} AND session_hash=${hash(session)} AND expires_at>now()`;
  if (!row)
    throw new CommerceError("Quote expired. Please request a new quote.", 409);
  return row.snapshot as Quote;
}
async function recordPayment(org: string, id: string, p: SquarePayment) {
  const sql = commerceDb();
  const state =
    p.status === "APPROVED"
      ? "authorized"
      : p.status === "COMPLETED"
        ? p.refunded_money?.amount === p.amount_money.amount
          ? "refunded"
          : p.refunded_money?.amount
            ? "refunding"
            : "paid"
        : p.status === "CANCELED"
          ? "voided"
          : "failed";
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const [row] = await tx<
      OrderRow[]
    >`SELECT * FROM hearth_parts_orders WHERE org_id=${org} AND id=${id} FOR UPDATE`;
    if (
      !row ||
      (row.square_payment_id && row.square_payment_id !== p.id) ||
      row.square_order_id !== p.order_id
    )
      throw new CommerceError("Payment conflict requires review.", 409);
    if (
      (["paid", "refunding", "refunded"].includes(row.payment_state) &&
        state === "authorized") ||
      (["voided", "failed"].includes(row.payment_state) &&
        state === "authorized")
    )
      return;
    const paymentState = row.payment_state === "refunded" ? "refunded" : state;
    await tx`UPDATE hearth_parts_orders SET square_payment_id=${p.id},payment_state=${paymentState},delayed_until=${p.delayed_until || null},receipt_url=${p.receipt_url || null},checked_at=now(),updated_at=now(),lease_until=NULL,last_error=NULL WHERE org_id=${org} AND id=${id}`;
    if (["voided", "failed", "refunded"].includes(paymentState))
      await tx`DELETE FROM hearth_parts_reservations WHERE org_id=${org} AND order_id=${id}`;
    else
      await tx`UPDATE hearth_parts_reservations SET expires_at=greatest(expires_at,now()+interval '24 hours',${p.delayed_until || null}::timestamptz) WHERE org_id=${org} AND order_id=${id}`;
  });
  await publishOrder(org, id);
  return { orderId: id, status: state, expiresAt: p.delayed_until };
}
export async function authorizeQuote(
  input: { quoteId: string; sourceId: string },
  session: string,
) {
  if (!paymentSetupReady())
    throw new CommerceError("Payment and tax setup is pending.", 503);
  const org = commerceOrg(),
    sql = commerceDb(),
    square = await squareService();
  const quote = await readQuote(input.quoteId, session),
    id = quote.id;
  if (!quote.manualShipping) requireCheckout();
  const source = text(input.sourceId, 1000);
  const [existing] = await sql<
    OrderRow[]
  >`SELECT * FROM hearth_parts_orders WHERE org_id=${org} AND id=${id} AND session_hash=${hash(session)}`;
  if (existing?.square_payment_id)
    return recordPayment(
      org,
      id,
      await square.read(
        existing.square_payment_id,
        id,
        quote,
        existing.square_order_id!,
      ),
    );
  if (existing?.square_order_id) {
    const p = await square.find(existing.square_order_id, id, quote);
    if (p) return recordPayment(org, id, p);
  }
  const lines = await pricedLines(
    org,
    quote.lines.map((l) => ({ key: l.key, quantity: l.quantity })),
    !quote.manualShipping,
  );
  if (
    lines.some((l) => {
      const old = quote.lines.find((o) => o.key === l.key)!;
      return (
        l.unitPriceCents !== old.unitPriceCents || l.offerHash !== old.offerHash
      );
    })
  )
    throw new CommerceError(
      "Availability or pricing changed. Review a new quote before authorizing.",
      409,
    );
  // Lock each product in a deterministic order to serialize local last-unit reservations.
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const locked = await tx<
      PartRow[]
    >`SELECT * FROM hearth_parts WHERE org_id=${org} AND key IN ${tx(lines.map((l) => l.key))} ORDER BY key FOR UPDATE`;
    for (const line of lines) {
      const offer = effectiveOffer(locked.find((r) => r.key === line.key)!);
      if (!offer) throw new CommerceError("Availability changed.", 409);
      assertPurchasable(offer, line.quantity);
      const [reserved] =
        await tx`SELECT coalesce(sum(quantity),0)::int AS quantity FROM hearth_parts_reservations WHERE org_id=${org} AND key=${line.key} AND order_id<>${id} AND expires_at>now()`;
      if (
        offer.quantity !== null &&
        offer.quantity - reserved.quantity < line.quantity
      )
        throw new CommerceError(
          `${line.sku} is being confirmed for another order. Request a quote.`,
          409,
        );
    }
    await tx`INSERT INTO hearth_parts_orders(org_id,id,session_hash,quote_id,snapshot) VALUES(${org},${id},${hash(session)},${id},${tx.json(quote)}) ON CONFLICT DO NOTHING`;
    const lease =
      await tx`UPDATE hearth_parts_orders SET lease_until=now()+interval '90 seconds' WHERE org_id=${org} AND id=${id} AND session_hash=${hash(session)} AND payment_state='pending' AND (lease_until IS NULL OR lease_until<now()) RETURNING id`;
    if (!lease.length)
      throw new CommerceError(
        "This checkout is processing. Check its status before retrying.",
        409,
      );
    for (const line of lines)
      await tx`INSERT INTO hearth_parts_reservations(org_id,order_id,key,quantity,expires_at) VALUES(${org},${id},${line.key},${line.quantity},now()+interval '7 days') ON CONFLICT DO NOTHING`;
  });
  try {
    const orderId =
      existing?.square_order_id || (await square.createOrder(id, quote));
    await sql`UPDATE hearth_parts_orders SET square_order_id=${orderId} WHERE org_id=${org} AND id=${id}`;
    const p = await square.authorize(id, quote, orderId, source);
    return await recordPayment(org, id, p);
  } catch {
    // A network timeout may have authorized the card. Keep the reservation and reconcile; never automatically retry with a new payment key.
    await sql`UPDATE hearth_parts_orders SET last_error='Authorization could not be confirmed; reconciliation required.',updated_at=now() WHERE org_id=${org} AND id=${id}`;
    throw new CommerceError(
      "Payment status is being checked. Keep this page open; do not submit a second order.",
      503,
    );
  }
}
export async function orderStatus(id: string, session: string) {
  if (!uuid.test(id)) throw new CommerceError("Invalid order number.");
  const sql = commerceDb(),
    org = commerceOrg();
  const [row] = await sql<
    OrderRow[]
  >`SELECT * FROM hearth_parts_orders WHERE org_id=${org} AND id=${id} AND session_hash=${hash(session)}`;
  if (!row) throw new CommerceError("Order not found.", 404);
  return {
    orderId: id,
    status: row.payment_state,
    fulfillment: row.fulfillment_state,
    expiresAt: row.delayed_until?.toISOString(),
    tracking: row.tracking,
  };
}
export async function adminOrderAction(
  input: {
    id: string;
    action: string;
    confirmation?: string;
    tracking?: string;
  },
  org: string,
  actor: string,
) {
  if (org !== commerceOrg() || !uuid.test(input.id))
    throw new CommerceError("Order unavailable.", 404);
  const sql = commerceDb(),
    square = await squareService();
  const [row] = await sql<
    OrderRow[]
  >`SELECT * FROM hearth_parts_orders WHERE org_id=${org} AND id=${input.id}`;
  if (!row?.square_order_id || !row.square_payment_id)
    throw new CommerceError(
      "Payment needs reconciliation before this action.",
      409,
    );
  const p = await square.read(
    row.square_payment_id,
    row.id,
    row.snapshot,
    row.square_order_id,
  );
  if (input.action === "capture") {
    const confirmation = text(input.confirmation, 200);
    if (
      !["APPROVED", "COMPLETED"].includes(p.status) ||
      (p.status === "APPROVED" && Date.parse(p.delayed_until!) <= Date.now())
    )
      throw new CommerceError(
        "Authorization expired or canceled. Send a new checkout link.",
        409,
      );
    const saved =
      await sql`UPDATE hearth_parts_orders SET supplier_confirmation=${confirmation},fulfillment_state='supplier_ordered',updated_at=now() WHERE org_id=${org} AND id=${row.id} AND (supplier_confirmation IS NULL OR supplier_confirmation=${confirmation}) RETURNING id`;
    if (!saved.length)
      throw new CommerceError(
        "This order already has a different supplier confirmation.",
        409,
      );
    try {
      await recordPayment(
        org,
        row.id,
        p.status === "COMPLETED"
          ? p
          : await square.complete(p, row.id, row.snapshot),
      );
    } catch {
      await sql`UPDATE hearth_parts_orders SET last_error='Supplier ordered; capture needs review. Do not reorder.' WHERE org_id=${org} AND id=${row.id}`;
      throw new CommerceError(
        "Supplier order saved. Payment capture needs review; do not order from the supplier again.",
        503,
      );
    }
  } else if (input.action === "void") {
    if (!["APPROVED", "CANCELED"].includes(p.status))
      throw new CommerceError("Only an authorization can be voided.", 409);
    await recordPayment(
      org,
      row.id,
      p.status === "CANCELED"
        ? p
        : await square.cancel(p, row.id, row.snapshot),
    );
  } else if (input.action === "refund") {
    if (p.status !== "COMPLETED")
      throw new CommerceError("Only a completed payment can be refunded.", 409);
    const status = await square.refund(p, row.id, row.snapshot);
    await sql`UPDATE hearth_parts_orders SET payment_state=${status === "COMPLETED" ? "refunded" : "refunding"},updated_at=now() WHERE org_id=${org} AND id=${row.id}`;
    await publishOrder(org, row.id);
  } else if (input.action === "tracking") {
    if (p.status !== "COMPLETED" || !row.supplier_confirmation)
      throw new CommerceError(
        "Confirm the supplier order and payment first.",
        409,
      );
    await sql`UPDATE hearth_parts_orders SET tracking=${text(input.tracking, 1000)},fulfillment_state='shipped',updated_at=now() WHERE org_id=${org} AND id=${row.id}`;
    await publishOrder(org, row.id);
  } else throw new CommerceError("Unknown order action.");
  await sql`INSERT INTO hearth_parts_history(org_id,key,kind,payload) VALUES(${org},${row.id},'order_action',${sql.json({ action: input.action, actor })})`;
  return { ok: true };
}
export async function reconcileCommerce(org: string, onlyId?: string) {
  const sql = commerceDb(),
    square = await squareService();
  let checked = 0;
  const rows = await sql<
    OrderRow[]
  >`SELECT * FROM hearth_parts_orders WHERE org_id=${org} AND square_order_id IS NOT NULL AND (${onlyId || null}::uuid IS NULL OR id=${onlyId || null}::uuid) AND (payment_state IN ('pending','authorized','refunding') OR ${Boolean(onlyId)}) ORDER BY checked_at ASC NULLS FIRST LIMIT 15`;
  for (const row of rows) {
    try {
      let p = row.square_payment_id
        ? await square.read(
            row.square_payment_id,
            row.id,
            row.snapshot,
            row.square_order_id!,
          )
        : await square.find(row.square_order_id!, row.id, row.snapshot);
      if (
        p?.status === "APPROVED" &&
        Date.parse(p.delayed_until!) < Date.now() + 300000
      )
        p = await square.cancel(p, row.id, row.snapshot);
      if (p) {
        await recordPayment(org, row.id, p);
        if (
          p.status === "APPROVED" &&
          (Date.now() - row.created_at.getTime() > 86400000 ||
            Date.parse(p.delayed_until!) - Date.now() < 86400000)
        ) {
          const phase =
            Date.parse(p.delayed_until!) - Date.now() < 86400000
              ? "expires"
              : "24h";
          await outbox(
            sql,
            org,
            `${row.id}:reminder:${phase}`,
            process.env.ADMIN_EMAIL || "",
            `Parts order ${row.id.slice(0, 8)} needs supplier confirmation`,
            `Review this order in HearthOS Website Inbox. Authorization expires ${p.delayed_until}. ${row.supplier_confirmation ? "Supplier already ordered. Do not reorder." : "Supplier order has not been confirmed."}`,
          );
        }
      } else
        await sql`UPDATE hearth_parts_orders SET checked_at=now() WHERE org_id=${org} AND id=${row.id}`;
      checked++;
    } catch {
      await sql`UPDATE hearth_parts_orders SET checked_at=now(),last_error='Payment reconciliation needs review.' WHERE org_id=${org} AND id=${row.id}`;
    }
  }
  await deliverOutbox(org);
  return { checked };
}
export async function deliverOutbox(org: string) {
  const sql = commerceDb();
  const messages =
    await sql`UPDATE hearth_parts_outbox SET lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE org_id=${org} AND id IN (SELECT id FROM hearth_parts_outbox WHERE org_id=${org} AND sent_at IS NULL AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING *`;
  for (const message of messages) {
    try {
      const p = message.payload;
      await sendSmtpEmail({
        to: p.to,
        subject: p.subject,
        text: p.body,
        html: `<p>${String(p.body).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
        messageId: `<${hash([org, message.id])}@aaronsfireplaceco.com>`,
        attempts: 1,
      });
      await sql`UPDATE hearth_parts_outbox SET sent_at=now(),lease_until=NULL WHERE org_id=${org} AND id=${message.id}`;
    } catch {
      await sql`UPDATE hearth_parts_outbox SET lease_until=NULL,next_attempt_at=now()+interval '15 minutes' WHERE org_id=${org} AND id=${message.id}`;
    }
  }
}

export async function emailManualQuote(
  input: {
    items: unknown;
    address: Record<string, unknown>;
    shippingCents: number;
    shippingMethod: string;
    reference: string;
  },
  org: string,
  actor: string,
) {
  if (org !== commerceOrg() || !paymentSetupReady())
    throw new CommerceError(
      "Square and tax settings must be verified before sending a checkout link.",
      503,
    );
  if (
    !Number.isSafeInteger(input.shippingCents) ||
    input.shippingCents < 0 ||
    input.shippingCents > 1000000
  )
    throw new CommerceError("Enter a valid supplier shipping charge.");
  const sql = commerceDb(),
    address = parseAddress(input.address);
  if (!Array.isArray(input.items) || input.items.length > 25)
    throw new CommerceError("Enter up to 25 SKU lines.");
  const resolved = [];
  for (const line of input.items) {
    const matches = await sql<
      Array<{ key: string }>
    >`SELECT key FROM hearth_parts WHERE org_id=${org} AND sku=${text(line.sku, 100)} AND duplicate=false LIMIT 2`;
    if (matches.length !== 1)
      throw new CommerceError(
        "A SKU needs catalog review before quoting.",
        409,
      );
    resolved.push({ key: matches[0].key, quantity: line.quantity });
  }
  const lines = await pricedLines(org, parseCart(resolved), false);
  const tax = await taxJarQuote(lines, address, input.shippingCents),
    token = randomBytes(32).toString("hex");
  const quote: Quote = {
    id: randomUUID(),
    address,
    lines,
    shipping: {
      id: "owner-confirmed",
      label: text(input.shippingMethod, 200),
      amountCents: input.shippingCents,
      supplierCartId: text(input.reference, 200),
    },
    manualShipping: {
      reference: text(input.reference, 200),
      confirmedBy: actor,
    },
    taxCents: tax.amountCents,
    totalCents:
      lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0) +
      input.shippingCents +
      tax.amountCents,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
  };
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    await tx`INSERT INTO hearth_parts_quotes(org_id,id,session_hash,snapshot,expires_at) VALUES(${org},${quote.id},${hash(token)},${tx.json(quote)},${quote.expiresAt})`;
    await outbox(
      tx,
      org,
      `${quote.id}:checkout`,
      address.email,
      "Your Aaron's parts checkout link",
      `Your confirmed parts order total is $${(quote.totalCents / 100).toFixed(2)}. Review and authorize payment within 15 minutes: https://aaronsfireplaceco.com/checkout#quote=${quote.id}&token=${token}\nIf the quote expires, reply to request an updated link. We will not charge your card without your authorization.`,
    );
  });
  return { ok: true, quoteId: quote.id };
}
export async function redeemQuote(id: string, session: string) {
  if (!paymentSetupReady())
    throw new CommerceError("Payment setup is pending.", 503);
  const quote = await readQuote(id, session);
  return {
    quote,
    shipping: [quote.shipping],
    square: {
      applicationId: process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID,
      locationId: process.env.SQUARE_LOCATION_ID,
      environment: process.env.SQUARE_ENVIRONMENT,
    },
  };
}

export async function recordPartsInterest(input: unknown) {
  const cart = parseCart(input),
    org = commerceOrg(),
    sql = commerceDb();
  await sql`UPDATE hearth_parts SET active_until=now()+interval '24 hours',next_scan_at=least(next_scan_at,now()+interval '15 minutes') WHERE org_id=${org} AND key IN ${sql(cart.map((l) => l.key))}`;
  return { ok: true };
}
