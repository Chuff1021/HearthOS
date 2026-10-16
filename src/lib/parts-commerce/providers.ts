import { CommerceError, cents, hash, type Address, type Quote } from "./domain";

export class CardRejectedError extends CommerceError {}

const supplier = "https://www.stove-parts-unlimited.com";
type ShippingLine = Quote["lines"][number];
export function createSupplierShipping(request: typeof fetch = fetch) {
  // Each quote gets an isolated guest session. No supplier purchase is submitted.
  return async (lines: ShippingLine[], address: Address) => {
    const jar = new Map<string, string>();
    let cookie = "",
      cartId = "";
    async function call(path: string, body?: unknown, method = "POST") {
      const response = await request(`${supplier}/api/storefront/${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: supplier,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(jar.has("XSRF-TOKEN")
            ? { "X-XSRF-TOKEN": decodeURIComponent(jar.get("XSRF-TOKEN")!) }
            : {}),
          ...(jar.has("SF-CSRF-TOKEN")
            ? {
                "X-SF-CSRF-TOKEN": decodeURIComponent(
                  jar.get("SF-CSRF-TOKEN")!,
                ),
              }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const cookies = response.headers.getSetCookie();
      for (const entry of cookies) {
        const pair = entry.split(";", 1)[0],
          separator = pair.indexOf("=");
        if (separator > 0)
          jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
      if (!response.ok)
        throw new CommerceError(
          "Supplier shipping needs confirmation. Request an online quote.",
          503,
        );
      return response.status === 204 ? null : response.json();
    }
    try {
      const cart = await call("carts", {
        lineItems: lines.map((l) => ({
          productId: Number(l.sourceId),
          quantity: l.quantity,
        })),
        locale: "en",
      });
      if (typeof cart?.id !== "string" || cart.currency?.code !== "USD")
        throw new CommerceError("Supplier cart could not be verified.", 503);
      cartId = cart.id;
      const physical = cart.lineItems?.physicalItems;
      if (
        !Array.isArray(physical) ||
        physical.length !== lines.length ||
        cart.lineItems?.digitalItems?.length ||
        cart.lineItems?.customItems?.length
      )
        throw new CommerceError("Supplier packing requires review.", 409);
      for (const line of lines) {
        const found = physical.filter(
          (p) => String(p.productId) === line.sourceId && p.sku === line.sku,
        );
        if (
          found.length !== 1 ||
          found[0].quantity !== line.quantity ||
          cents(found[0].salePrice) !== line.unitPriceCents ||
          found[0].options?.length ||
          Number(found[0].stockPosition?.quantityBackordered || 0) > 0
        )
          throw new CommerceError(
            "Supplier cart changed. Please refresh your quote.",
            409,
          );
      }
      await call(`checkouts/${encodeURIComponent(cartId)}`, undefined, "GET");
      const checkout = await call(
        `checkouts/${encodeURIComponent(cartId)}/consignments?include=consignments.availableShippingOptions`,
        [
          {
            shippingAddress: {
              firstName: address.name,
              lastName: "",
              address1: address.street,
              address2: address.street2,
              city: address.city,
              stateOrProvinceCode: address.state,
              postalCode: address.zip,
              countryCode: "US",
            },
            lineItems: physical.map((p) => ({
              itemId: p.id,
              quantity: p.quantity,
            })),
          },
        ],
      );
      const consignments = checkout?.consignments;
      // Split consignments need a combined rate; don't accidentally charge only one box.
      if (
        !Array.isArray(consignments) ||
        consignments.length !== 1 ||
        !Array.isArray(consignments[0]?.availableShippingOptions)
      )
        throw new CommerceError(
          "Supplier shipment needs an online quote.",
          409,
        );
      const options = consignments[0].availableShippingOptions.map(
        (o: { id: string; description: string; cost: number }) => ({
          id: String(o.id),
          label: String(o.description),
          amountCents: cents(o.cost),
          supplierCartId: cartId,
        }),
      );
      if (
        !options.length ||
        options.some((o: { id: string; label: string }) => !o.id || !o.label)
      )
        throw new CommerceError(
          "No supplier shipping service is available for this address.",
          409,
        );
      // Aaron pays dealer shipping and is ineligible for the public retail
      // promotion. That promotion can hide the paid standard service entirely;
      // dropping it and choosing an express option would not recover that rate.
      // Obtain an owner-confirmed quote for the complete cart instead.
      if (
        options.some(
          (o: Quote["shipping"]) =>
            o.amountCents === 0 || /\bfree\b/i.test(o.label),
        )
      )
        throw new CommerceError(
          "Standard shipping needs confirmation for this cart. Request an online quote.",
          409,
        );
      return options as Quote["shipping"][];
    } finally {
      if (cartId)
        await call(
          `carts/${encodeURIComponent(cartId)}`,
          undefined,
          "DELETE",
        ).catch(() => {});
    }
  };
}
export async function taxJarQuote(
  lines: ShippingLine[],
  address: Address,
  shippingCents: number,
  request: typeof fetch = fetch,
) {
  if (
    !process.env.TAXJAR_API_TOKEN ||
    process.env.PARTS_TAX_SETTINGS_VERIFIED !== "true" ||
    !process.env.PARTS_TAX_ORIGIN ||
    !process.env.PARTS_TAX_NEXUS
  )
    throw new CommerceError(
      "Tax setup is pending. Please request an online quote.",
      503,
    );
  const origin = JSON.parse(process.env.PARTS_TAX_ORIGIN),
    nexus = JSON.parse(process.env.PARTS_TAX_NEXUS);
  if (
    !origin.country ||
    !origin.state ||
    !origin.zip ||
    !Array.isArray(nexus) ||
    !nexus.length
  )
    throw new CommerceError("Tax settings need review.", 503);
  const body = {
    from_country: origin.country,
    from_state: origin.state,
    from_zip: origin.zip,
    from_city: origin.city,
    from_street: origin.street,
    to_country: "US",
    to_state: address.state,
    to_zip: address.zip,
    to_city: address.city,
    to_street: address.street,
    amount: lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0) / 100,
    shipping: shippingCents / 100,
    nexus_addresses: nexus,
    line_items: lines.map((l) => ({
      id: l.key,
      quantity: l.quantity,
      unit_price: l.unitPriceCents / 100,
    })),
  };
  const response = await request("https://api.taxjar.com/v2/taxes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TAXJAR_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new CommerceError("Tax calculation is temporarily unavailable.", 503);
  const data = await response.json();
  return {
    amountCents: cents(data?.tax?.amount_to_collect),
    reference: hash({ body, tax: data.tax }),
  };
}
export type SquarePayment = {
  id: string;
  order_id: string;
  reference_id: string;
  location_id: string;
  status: string;
  amount_money: { amount: number; currency: string };
  delayed_until?: string;
  version_token?: string;
  receipt_url?: string;
  refunded_money?: { amount: number };
};
export function createPartsSquare(
  config: {
    accessToken: string;
    locationId: string;
    environment: "sandbox" | "production";
  },
  request: typeof fetch = fetch,
) {
  const base =
    config.environment === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";
  async function call(path: string, body?: unknown) {
    const response = await request(`${base}/v2/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2026-09-16",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      if (
        path === "payments" &&
        problem.errors?.some((e: { code: string }) =>
          [
            "CARD_DECLINED",
            "GENERIC_DECLINE",
            "CVV_FAILURE",
            "CARD_EXPIRED",
            "INVALID_EXPIRATION",
            "VERIFY_CVV_FAILURE",
          ].includes(e.code),
        )
      )
        throw new CardRejectedError(
          "Card not approved. Get a new quote and try another card.",
          402,
        );
      throw new CommerceError(
        "Square could not confirm this action. Retry the same order; do not place a second supplier order.",
        503,
      );
    }
    return response.json();
  }
  function verify(p: SquarePayment, id: string, q: Quote, orderId?: string) {
    if (
      !p?.id ||
      p.reference_id !== id ||
      (orderId && p.order_id !== orderId) ||
      p.location_id !== config.locationId ||
      p.amount_money?.currency !== "USD" ||
      p.amount_money.amount !== q.totalCents ||
      !["APPROVED", "COMPLETED", "CANCELED", "FAILED"].includes(p.status)
    )
      throw new CommerceError("Square payment mismatch; review required.", 409);
    if (
      p.status === "APPROVED" &&
      (!p.delayed_until || !Number.isFinite(Date.parse(p.delayed_until)))
    )
      throw new CommerceError("Square authorization deadline is missing.", 409);
    return p;
  }
  return {
    async createOrder(id: string, q: Quote) {
      const lines = q.lines.map((l) => ({
        name: l.name,
        quantity: String(l.quantity),
        base_price_money: { amount: l.unitPriceCents, currency: "USD" },
        note: `SKU ${l.sku}`,
      }));
      // Fixed tax and shipping are explicit, separate lines; Square must not recompute a different total.
      if (q.shipping.amountCents)
        lines.push({
          name: `Shipping: ${q.shipping.label}`,
          quantity: "1",
          base_price_money: { amount: q.shipping.amountCents, currency: "USD" },
          note: "Supplier shipping quote",
        });
      if (q.taxCents)
        lines.push({
          name: "Sales tax",
          quantity: "1",
          base_price_money: { amount: q.taxCents, currency: "USD" },
          note: "TaxJar destination calculation",
        });
      const data = await call("orders", {
        idempotency_key: hash([id, "order"]).slice(0, 40),
        order: {
          location_id: config.locationId,
          reference_id: id,
          line_items: lines,
        },
      });
      if (
        !data.order?.id ||
        data.order.location_id !== config.locationId ||
        data.order.total_money?.amount !== q.totalCents ||
        data.order.total_money?.currency !== "USD"
      )
        throw new CommerceError("Square order total mismatch.", 409);
      return data.order.id as string;
    },
    async authorize(id: string, q: Quote, orderId: string, sourceId: string) {
      if (!sourceId.startsWith("cnon:"))
        throw new CommerceError("Use the secure card form.");
      const data = await call("payments", {
        idempotency_key: hash([id, "authorize"]).slice(0, 40),
        source_id: sourceId,
        autocomplete: false,
        delay_action: "CANCEL",
        amount_money: { amount: q.totalCents, currency: "USD" },
        location_id: config.locationId,
        order_id: orderId,
        reference_id: id,
        buyer_email_address: q.address.email,
        shipping_address: {
          address_line_1: q.address.street,
          address_line_2: q.address.street2,
          locality: q.address.city,
          administrative_district_level_1: q.address.state,
          postal_code: q.address.zip,
          country: "US",
        },
      });
      return verify(data.payment, id, q, orderId);
    },
    async read(paymentId: string, id: string, q: Quote, orderId: string) {
      return verify(
        (await call(`payments/${encodeURIComponent(paymentId)}`)).payment,
        id,
        q,
        orderId,
      );
    },
    async find(orderId: string, id: string, q: Quote) {
      const order = (await call(`orders/${encodeURIComponent(orderId)}`)).order;
      const tenders = order?.tenders || [];
      if (!tenders.length) return null;
      if (tenders.length !== 1 || !tenders[0].payment_id)
        throw new CommerceError("Payment needs review.", 409);
      return verify(
        (await call(`payments/${encodeURIComponent(tenders[0].payment_id)}`))
          .payment,
        id,
        q,
        orderId,
      );
    },
    async complete(p: SquarePayment, id: string, q: Quote) {
      return verify(
        (
          await call(`payments/${encodeURIComponent(p.id)}/complete`, {
            version_token: p.version_token,
          })
        ).payment,
        id,
        q,
        p.order_id,
      );
    },
    async cancel(p: SquarePayment, id: string, q: Quote) {
      return verify(
        (await call(`payments/${encodeURIComponent(p.id)}/cancel`, {})).payment,
        id,
        q,
        p.order_id,
      );
    },
    async refund(p: SquarePayment, id: string, q: Quote) {
      const data = await call("refunds", {
        idempotency_key: hash([id, "full-refund"]).slice(0, 40),
        payment_id: p.id,
        amount_money: { amount: q.totalCents, currency: "USD" },
        reason: "Website order refund",
      });
      if (!["PENDING", "COMPLETED"].includes(data.refund?.status))
        throw new CommerceError("Refund requires review.", 409);
      return data.refund.status as string;
    },
  };
}
