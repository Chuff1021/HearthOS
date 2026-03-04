import { NextRequest, NextResponse } from "next/server";
import { upsertSquarePayment } from "@/lib/square-payment-store";

const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || "production";
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;

function baseUrl() {
  return SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export async function POST(request: NextRequest) {
  try {
    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
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
        location_id: SQUARE_LOCATION_ID,
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

    const res = await fetch(`${baseUrl()}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
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

    upsertSquarePayment({
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
    });

    return NextResponse.json({
      ok: true,
      paymentLinkId: data?.payment_link?.id,
      url: data?.payment_link?.url,
      orderId,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unexpected Square checkout error",
      },
      { status: 500 }
    );
  }
}
