import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, or } from 'drizzle-orm';
import { customers, db, invoices } from '@/db';
import { listJobs } from '@/lib/job-store';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { listSquarePayments } from '@/lib/square-payment-store';
import { getSquareCredentials } from '@/lib/integrations/store';
import { requirePermission, tenantErrorResponse } from '@/lib/tenant/context';

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

function baseUrl(environment: string) {
  return environment === 'sandbox'
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

type PaymentContext = {
  customerName: string;
  referenceLabel: string;
};

function customerDisplayName(customer: { firstName?: string | null; lastName?: string | null; companyName?: string | null }) {
  return customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || 'Square Customer';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolvePaymentContexts(squarePayments: any[]): Promise<Map<string, PaymentContext>> {
  const references = [...new Set(
    squarePayments.map((payment) => String(payment?.reference_id || '').trim()).filter(Boolean),
  )];
  if (references.length === 0) return new Map();

  const contexts = new Map<string, PaymentContext>();
  try {
    const org = await getOrCreateDefaultOrg();
    const uuidReferences = references.filter(isUuid);
    const invoiceFilters = [
      inArray(invoices.invoiceNumber, references),
      inArray(invoices.qbInvoiceId, references),
    ];
    if (uuidReferences.length > 0) invoiceFilters.push(inArray(invoices.id, uuidReferences));

    const [jobs, invoiceRows] = await Promise.all([
      listJobs(),
      db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          qbInvoiceId: invoices.qbInvoiceId,
          firstName: customers.firstName,
          lastName: customers.lastName,
          companyName: customers.companyName,
        })
        .from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(and(eq(invoices.orgId, org.id), or(...invoiceFilters)!)),
    ]);

    for (const row of invoiceRows) {
      const context = {
        customerName: customerDisplayName(row),
        referenceLabel: row.invoiceNumber?.replace(/^QB-/i, '') || row.qbInvoiceId || row.id,
      };
      for (const key of [row.id, row.invoiceNumber, row.qbInvoiceId].filter(Boolean)) {
        contexts.set(String(key), context);
      }
    }

    const referencedJobs = jobs.filter((job) => references.includes(job.id));
    const customerIds = [...new Set(referencedJobs.map((job) => job.customerId).filter(isUuid))];
    const customerRows = customerIds.length > 0
      ? await db
          .select({
            id: customers.id,
            firstName: customers.firstName,
            lastName: customers.lastName,
            companyName: customers.companyName,
          })
          .from(customers)
          .where(and(eq(customers.orgId, org.id), inArray(customers.id, customerIds)))
      : [];
    const customerById = new Map(customerRows.map((customer) => [customer.id, customerDisplayName(customer)]));

    for (const job of referencedJobs) {
      contexts.set(job.id, {
        customerName: customerById.get(job.customerId) || job.customerName || 'Square Customer',
        referenceLabel: job.jobNumber || job.id,
      });
    }
  } catch (err) {
    console.error('Failed to resolve Square payment references:', err);
  }

  return contexts;
}

export async function GET(request: NextRequest) {
  let fallback: UiPayment[] = [];
  try {
    await requirePermission('financials:read');
    const org = await getOrCreateDefaultOrg();
    const square = await getSquareCredentials(org);
    fallback = (await listSquarePayments(org.id))
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

    if (!square?.accessToken || !square.locationId) {
      return NextResponse.json({ payments: fallback, source: 'cache', total: fallback.length });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));

    const query = new URLSearchParams({
      location_id: square.locationId,
      sort_order: 'DESC',
      limit: String(limit),
    });
    const res = await fetch(`${baseUrl(square.environment)}/v2/payments?${query.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${square.accessToken}`,
        'Square-Version': '2024-12-18',
      },
      cache: 'no-store',
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { payments: fallback, source: 'cache', total: fallback.length, squareError: data },
        { status: 200 }
      );
    }

    const squarePayments = data?.payments || [];
    const contexts = await resolvePaymentContexts(squarePayments);
    const payments = squarePayments.map((p: any): UiPayment => {
      const amount = Number(p?.amount_money?.amount || 0) / 100;
      const refunded = Number(p?.refunded_money?.amount || 0) / 100;
      const reference = String(p?.reference_id || '').trim();
      const context = contexts.get(reference);
      return {
        id: p.id,
        invoiceId: p.order_id || p.id,
        invoiceNumber: context?.referenceLabel || reference || p.order_id || 'Square Order',
        customerId: p.customer_id || p.id,
        customerName:
          context?.customerName ||
          p?.buyer_email_address ||
          p?.card_details?.card?.cardholder_name ||
          'Square Customer',
        amount,
        method: mapMethod(p?.source_type),
        status: mapStatus(p?.status, refunded),
        paymentDate: p?.updated_at || p?.created_at || new Date().toISOString(),
        transactionId: p.id,
        receiptUrl: p?.receipt_url,
        notes: p?.note,
      };
    });

    return NextResponse.json({ payments, source: 'square', total: payments.length });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json({ payments: fallback, source: 'cache', total: fallback.length });
  }
}
