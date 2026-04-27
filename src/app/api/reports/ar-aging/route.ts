import { NextRequest, NextResponse } from 'next/server';
import { db, invoices, customers } from '@/db';
import { and, eq, sql, desc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/reports/ar-aging
// Open invoice balances bucketed by days overdue, grouped by customer.
//
// Buckets: current (not yet due), 1-30, 31-60, 61-90, 91+
// Each customer row has the per-bucket subtotals + grand total.

type Bucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd91_plus';
const BUCKETS: Bucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd91_plus'];

function bucketize(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd91_plus';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyOverdue = searchParams.get('onlyOverdue') === 'true';
    const minBalance = Math.max(0, Number(searchParams.get('minBalance')) || 0);

    const org = await getOrCreateDefaultOrg();

    // Pull every invoice with balance > 0
    const rows = await db
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        balance: invoices.balance,
        totalAmount: invoices.totalAmount,
        customerId: customers.id,
        customerName: sql<string>`COALESCE(${customers.companyName}, ${customers.firstName} || ' ' || ${customers.lastName})`,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(and(
        eq(invoices.orgId, org.id),
        sql`${invoices.balance} > 0`,
      ))
      .orderBy(desc(invoices.dueDate));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type CustGroup = {
      customerId: string | null;
      customerName: string;
      customerEmail: string | null;
      customerPhone: string | null;
      buckets: Record<Bucket, number>;
      totalBalance: number;
      invoices: Array<{
        id: string;
        number: string | null;
        issueDate: string | null;
        dueDate: string | null;
        balance: number;
        totalAmount: number;
        daysOverdue: number;
        bucket: Bucket;
      }>;
    };

    const byCustomer = new Map<string, CustGroup>();
    const totals: Record<Bucket, number> = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 };
    let invoiceCount = 0;

    for (const r of rows) {
      const balance = Number(r.balance ?? 0);
      if (balance <= 0) continue;

      const dueDate = r.dueDate ? new Date(r.dueDate) : (r.issueDate ? new Date(r.issueDate) : today);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400_000);
      const bucket = bucketize(daysOverdue);

      if (onlyOverdue && bucket === 'current') continue;

      const key = r.customerId || `unknown:${r.invoiceId}`;
      let g = byCustomer.get(key);
      if (!g) {
        g = {
          customerId: r.customerId ?? null,
          customerName: r.customerName || 'Unknown',
          customerEmail: r.customerEmail ?? null,
          customerPhone: r.customerPhone ?? null,
          buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 },
          totalBalance: 0,
          invoices: [],
        };
        byCustomer.set(key, g);
      }
      g.buckets[bucket] += balance;
      g.totalBalance += balance;
      g.invoices.push({
        id: r.invoiceId,
        number: r.invoiceNumber,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        balance,
        totalAmount: Number(r.totalAmount ?? 0),
        daysOverdue,
        bucket,
      });
      totals[bucket] += balance;
      invoiceCount++;
    }

    const customerGroups = [...byCustomer.values()]
      .filter((g) => g.totalBalance >= minBalance)
      .sort((a, b) => b.totalBalance - a.totalBalance);

    const grandTotal = BUCKETS.reduce((s, b) => s + totals[b], 0);
    const overdueTotal = totals.d1_30 + totals.d31_60 + totals.d61_90 + totals.d91_plus;

    return NextResponse.json({
      customers: customerGroups,
      buckets: totals,
      grandTotal,
      overdueTotal,
      invoiceCount,
      customerCount: customerGroups.length,
    });
  } catch (err: any) {
    console.error('A/R aging failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
