import { authorizeCrmApi } from "@/lib/security/crm-access";
import { NextRequest, NextResponse } from 'next/server';
import { listSquarePayments } from '@/lib/square-payment-store';
import { recordedSquareTransactions } from '@/lib/square/collection-access';

type UiPayment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: 'credit_card' | 'check' | 'cash' | 'bank_transfer';
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  paymentDate: string;
  transactionId?: string;
  receiptUrl?: string;
  notes?: string;
};

const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'production';
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;

function baseUrl() {
  return SQUARE_ENV === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

function mapMethod(sourceType?: string): UiPayment['method'] {
  switch ((sourceType || '').toUpperCase()) {
    case 'CASH':
      return 'cash';
    case 'BANK_ACCOUNT':
      return 'bank_transfer';
    case 'EXTERNAL':
      return 'check';
    case 'CARD':
    default:
      return 'credit_card';
  }
}

function mapStatus(status: string, refundedAmount?: number): UiPayment['status'] {
  if ((refundedAmount || 0) > 0) return 'refunded';
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED':
      return 'completed';
    case 'APPROVED':
    case 'PENDING':
      return 'pending';
    case 'FAILED':
    case 'CANCELED':
      return 'failed';
    default:
      return 'pending';
  }
}

export async function GET(request: NextRequest) {
  const accessDenied = await authorizeCrmApi("/api/square/transactions", "GET");
  if (accessDenied) return accessDenied;
  let recorded: UiPayment[] = [];
  try {
    const history = await recordedSquareTransactions();
    recorded = history.payments;
    if (history.restricted) return NextResponse.json({ payments: recorded, source: 'collected-payments', total: recorded.length },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to load recorded payments.' }, { status: 503 });
  }
  const cached = listSquarePayments()
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 100)
    .map<UiPayment>((p) => ({
      id: p.id,
      invoiceId: p.orderId || p.id,
      invoiceNumber: p.invoiceNumber || p.orderId || 'Square Order',
      customerId: p.id,
      customerName: p.customerName || 'Square Customer',
      amount: p.amount,
      method: mapMethod(p.sourceType),
      status: mapStatus(p.status),
      paymentDate: p.updatedAt || p.createdAt,
      transactionId: p.id,
      receiptUrl: p.receiptUrl,
      notes: 'From Square webhook cache',
    }));

  const fallback = [...new Map([...cached, ...recorded].map(payment => [payment.id, payment])).values()]
    .sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate)).slice(0, 100);
  try {
    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
      return NextResponse.json({ payments: fallback, source: 'cache', total: fallback.length });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));

    const params = new URLSearchParams({ location_id: SQUARE_LOCATION_ID, sort_order: 'DESC', limit: String(limit) });
    const res = await fetch(`${baseUrl()}/v2/payments?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2024-12-18',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { payments: fallback, source: 'cache', total: fallback.length, warning: 'Square is unavailable; showing saved payment records.' },
        { status: 200 }
      );
    }

    const payments = (data?.payments || []).map((p: any): UiPayment => {
      const amount = Number(p?.amount_money?.amount || 0) / 100;
      const refunded = Number(p?.refunded_money?.amount || 0) / 100;
      return {
        id: p.id,
        invoiceId: p.order_id || p.id,
        invoiceNumber: p.order_id || 'Square Order',
        customerId: p.customer_id || p.id,
        customerName:
          p?.buyer_email_address || p?.card_details?.card?.cardholder_name || 'Square Customer',
        amount,
        method: mapMethod(p?.source_type),
        status: mapStatus(p?.status, refunded),
        paymentDate: p?.updated_at || p?.created_at || new Date().toISOString(),
        transactionId: p.id,
        receiptUrl: p?.receipt_url,
        notes: p?.note,
      };
    });

    const merged = new Map(fallback.map(payment => [payment.id, payment]));
    for (const payment of payments as UiPayment[]) {
      const saved = merged.get(payment.id);
      merged.set(payment.id, { ...payment, ...(saved ? { customerName: saved.customerName,
        customerId: saved.customerId, invoiceId: saved.invoiceId, invoiceNumber: saved.invoiceNumber, notes: saved.notes } : {}) });
    }
    const result = [...merged.values()].sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate)).slice(0, limit);
    return NextResponse.json({ payments: result, source: 'square', total: result.length });
  } catch (err) {
    return NextResponse.json({ payments: fallback, source: 'cache', total: fallback.length });
  }
}
