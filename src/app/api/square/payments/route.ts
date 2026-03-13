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
        { error: "Square is not configured. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const amount = Number(body?.amount);
    const sourceId = String(body?.sourceId || "");
    const customerName = String(body?.customerName || "Customer");
    const invoiceNumber = body?.invoiceNumber ? String(body.invoiceNumber) : undefined;
    const buyerEmail = body?.buyerEmail ? String(body.buyerEmail) : undefined;
    const note = body?.note ? String(body.note) : undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
    }

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    }

    const payload = {
      idempotency_key: crypto.randomUUID(),
      source_id: sourceId,
      autocomplete: true,
      location_id: SQUARE_LOCATION_ID,
      amount_money: {
        amount: Math.round(amount * 100),
        currency: "USD",
      },
      note: note || (invoiceNumber ? `HearthOS payment for ${invoiceNumber}` : `HearthOS payment for ${customerName}`),
      reference_id: invoiceNumber || undefined,
      buyer_email_address: buyerEmail,
    };

    const res = await fetch(`${baseUrl()}/v2/payments`, {
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
          error: "Failed to capture Square payment",
          squareError: data,
        },
        { status: res.status }
      );
    }

    const payment = data?.payment;
    upsertSquarePayment({
      id: String(payment?.id || crypto.randomUUID()),
      status: String(payment?.status || "COMPLETED"),
      amount,
      currency: payment?.amount_money?.currency || "USD",
      customerName,
      invoiceNumber,
      sourceType: payment?.source_type || "CARD",
      orderId: payment?.order_id,
      receiptUrl: payment?.receipt_url,
      createdAt: payment?.created_at || new Date().toISOString(),
      updatedAt: payment?.updated_at || new Date().toISOString(),
      raw: data,
    });

    return NextResponse.json({
      ok: true,
      paymentId: payment?.id,
      status: payment?.status,
      receiptUrl: payment?.receipt_url,
      payment,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected Square payment error" },
      { status: 500 }
    );
  }
}
