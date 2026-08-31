import { NextRequest, NextResponse } from "next/server";
import { upsertSquarePayment } from "@/lib/square-payment-store";
import { requirePermission, tenantErrorResponse } from "@/lib/tenant/context";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getSquareCredentials } from "@/lib/integrations/store";

function baseUrl(environment: string) {
  return environment === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("financials:write");
    const org = await getOrCreateDefaultOrg();
    const square = await getSquareCredentials(org);
    if (!square?.accessToken || !square.locationId) {
      return NextResponse.json(
        {
          error:
            "Square is not configured. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID on the server.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const amount = Number(body?.amount);
    const customerName = String(body?.customerName || "Customer");
    const note = body?.note ? String(body.note) : undefined;
    const invoiceNumber = body?.invoiceNumber ? String(body.invoiceNumber) : undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
    }

    const amountMoney = Math.round(amount * 100);
    const idempotencyKey = crypto.randomUUID();

    const payload = {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: invoiceNumber ? `Invoice ${invoiceNumber}` : "HearthOS Payment",
        price_money: {
          amount: amountMoney,
          currency: "USD",
        },
          location_id: square.locationId,
      },
      checkout_options: {
        ask_for_shipping_address: false,
        allow_tipping: true,
        redirect_url: body?.redirectUrl || undefined,
      },
      pre_populated_data: {
        buyer_email: body?.buyerEmail || undefined,
      },
      description: note || `Payment for ${customerName}`,
    };

    const res = await fetch(`${baseUrl(square.environment)}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${square.accessToken}`,
        "Square-Version": "2024-12-18",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "Failed to create Square checkout link",
          squareError: data,
        },
        { status: res.status }
      );
    }

    const orderId = data?.payment_link?.order_id as string | undefined;

    await upsertSquarePayment({
      id: String(data?.payment_link?.id || crypto.randomUUID()),
      status: 'PENDING',
      amount,
      currency: 'USD',
      customerName,
      invoiceNumber,
      sourceType: 'CARD',
      orderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      raw: data,
    }, org.id);

    return NextResponse.json({
      ok: true,
      paymentLinkId: data?.payment_link?.id,
      url: data?.payment_link?.url,
      orderId,
    });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unexpected Square checkout error",
      },
      { status: 500 }
    );
  }
}
