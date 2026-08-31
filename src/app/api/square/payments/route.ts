import { NextRequest, NextResponse } from "next/server";
import { recordInvoicePayment } from "@/lib/invoices/record-payment";
import { upsertSquarePayment } from "@/lib/square-payment-store";
import { db, organizations } from "@/db";
import { eq } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { getSquareCredentials } from "@/lib/integrations/store";
import { completePaymentIntent, getPaymentIntent } from "@/lib/integrations/payment-intents";
import { requirePermission, tenantErrorResponse } from "@/lib/tenant/context";

function baseUrl(environment: string) {
  return environment === "sandbox"
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
    const body = await request.json();
    const paymentToken = String(body?.paymentToken || "");
    const intent = paymentToken ? await getPaymentIntent(paymentToken) : null;
    if (paymentToken && !intent) {
      return NextResponse.json({ error: "Payment link is invalid or expired." }, { status: 404 });
    }

    let org;
    if (intent) {
      [org] = await db.select().from(organizations).where(eq(organizations.id, intent.org_id)).limit(1);
    } else {
      await requirePermission("financials:write");
      org = await getOrCreateDefaultOrg();
    }
    if (!org) return NextResponse.json({ error: "Payment organization is unavailable." }, { status: 404 });
    const square = await getSquareCredentials(org);
    if (!square?.accessToken || !square.locationId) {
      return NextResponse.json(
        { error: "Square is not configured. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID." },
        { status: 500 }
      );
    }

    const amount = Number(body?.amount);
    const intendedAmount = intent ? Number(intent.amount) : null;
    const invoiceAmount = intendedAmount ?? (body?.invoiceAmount == null ? amount : Number(body.invoiceAmount));
    const sourceId = String(body?.sourceId || "");
    const customerName = String(intent?.customer_name || body?.customerName || "Customer");
    const invoiceNumber = intent?.invoice_number ? String(intent.invoice_number) : body?.invoiceNumber ? String(body.invoiceNumber) : undefined;
    const buyerEmail = intent?.buyer_email ? String(intent.buyer_email) : body?.buyerEmail ? String(body.buyerEmail) : undefined;
    const note = body?.note ? String(body.note) : undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
    }
    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || invoiceAmount > amount) {
      return NextResponse.json({ error: "invoiceAmount must be greater than 0 and no more than amount" }, { status: 400 });
    }
    if (intendedAmount) {
      const cardTotal = intendedAmount * 1.035;
      const matchesInvoice = Math.abs(amount - intendedAmount) <= 0.01;
      const matchesCardTotal = Math.abs(amount - cardTotal) <= 0.01;
      if (!matchesInvoice && !matchesCardTotal) {
        return NextResponse.json({ error: "Payment amount does not match this secure payment link." }, { status: 400 });
      }
    }

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    }

    const payload = {
      idempotency_key: crypto.randomUUID(),
      source_id: sourceId,
      autocomplete: true,
      location_id: square.locationId,
      amount_money: {
        amount: Math.round(amount * 100),
        currency: "USD",
      },
      note: note || (invoiceNumber ? `HearthOS payment for ${invoiceNumber}` : `HearthOS payment for ${customerName}`),
      reference_id: invoiceNumber || undefined,
      buyer_email_address: buyerEmail,
    };

    const res = await fetch(`${baseUrl(square.environment)}/v2/payments`, {
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
          error: "Failed to capture Square payment",
          squareError: data,
        },
        { status: res.status }
      );
    }

    const payment = data?.payment;
    const squareStatus = String(payment?.status || "COMPLETED");
    const sourceType = payment?.source_type || "CARD";
    const storageScope = intent
      ? { orgId: org.id, trustedSystem: true as const }
      : org.id;
    await upsertSquarePayment({
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
    }, storageScope);

    let invoicePayment;
    if (invoiceNumber && squareStatus.toUpperCase() === "COMPLETED") {
      try {
        invoicePayment = await recordInvoicePayment({
          orgId: org.id,
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
    if (intent && squareStatus.toUpperCase() === "COMPLETED") {
      await completePaymentIntent(paymentToken, String(payment?.id || ""));
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
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected Square payment error" },
      { status: 500 }
    );
  }
}
