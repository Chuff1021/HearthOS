import { NextRequest, NextResponse } from "next/server";
import { recordInvoicePayment } from "@/lib/invoices/record-payment";
import { upsertSquarePayment } from "@/lib/square-payment-store";

const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || "production";
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;

function baseUrl() {
  return SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function paymentMethodFromSquare(sourceType: string | undefined) {
  const source = String(sourceType || "").toUpperCase();
  if (source.includes("BANK")) return "ach";
  if (source.includes("CARD")) return "credit_card";
  return source.toLowerCase() || "square";
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
    const invoiceAmount = body?.invoiceAmount == null ? amount : Number(body.invoiceAmount);
    const sourceId = String(body?.sourceId || "");
    const customerName = String(body?.customerName || "Customer");
    const invoiceNumber = body?.invoiceNumber ? String(body.invoiceNumber) : undefined;
    const buyerEmail = body?.buyerEmail ? String(body.buyerEmail) : undefined;
    const note = body?.note ? String(body.note) : undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
    }
    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || invoiceAmount > amount) {
      return NextResponse.json({ error: "invoiceAmount must be greater than 0 and no more than amount" }, { status: 400 });
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
    const squareStatus = String(payment?.status || "COMPLETED");
    const sourceType = payment?.source_type || "CARD";
    upsertSquarePayment({
      id: String(payment?.id || crypto.randomUUID()),
      status: squareStatus,
      amount,
      currency: payment?.amount_money?.currency || "USD",
      customerName,
      invoiceNumber,
      sourceType,
      orderId: payment?.order_id,
      receiptUrl: payment?.receipt_url,
      createdAt: payment?.created_at || new Date().toISOString(),
      updatedAt: payment?.updated_at || new Date().toISOString(),
      raw: data,
    });

    let invoicePayment;
    if (invoiceNumber && squareStatus.toUpperCase() === "COMPLETED") {
      try {
        invoicePayment = await recordInvoicePayment({
          invoiceNumber,
          amount: invoiceAmount,
          paymentMethod: paymentMethodFromSquare(sourceType),
          transactionId: payment?.id,
          paidAt: payment?.created_at ? new Date(payment.created_at) : new Date(),
          notes: [
            `Square ${sourceType} payment ${payment?.id || ""}`.trim(),
            squareStatus ? `Status: ${squareStatus}` : undefined,
            payment?.receipt_url ? `Receipt: ${payment.receipt_url}` : undefined,
            buyerEmail ? `Buyer email: ${buyerEmail}` : undefined,
          ].filter(Boolean).join("\n"),
        });
      } catch (recordErr) {
        console.error("Square payment captured but invoice payment recording failed:", recordErr);
        invoicePayment = {
          recorded: false,
          reason: recordErr instanceof Error ? recordErr.message : "recording_failed",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      paymentId: payment?.id,
      status: payment?.status,
      receiptUrl: payment?.receipt_url,
      payment,
      invoicePayment,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected Square payment error" },
      { status: 500 }
    );
  }
}
