import { NextRequest, NextResponse } from 'next/server';
import { db, payments, bills } from '@/db';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/reports/cash-flow
// Money in (customer payments via payments.paidAt) vs money out (bills paid
// via bills.totalAmount when status='paid', dated by issueDate).
// Bucketed monthly; default window is last 12 months.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthsBack = Math.min(60, Math.max(1, parseInt(searchParams.get('monthsBack') || '12', 10)));
    const since = searchParams.get('since') || (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - monthsBack);
      return d.toISOString().slice(0, 10);
    })();
    const until = searchParams.get('until') || new Date().toISOString().slice(0, 10);

    const org = await getOrCreateDefaultOrg();

    // Money in — payments
    const paymentRows = await db
      .select({
        amount: payments.amount,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .where(and(
        eq(payments.orgId, org.id),
        sql`${payments.paidAt} >= ${since + 'T00:00:00Z'}::timestamptz`,
        sql`${payments.paidAt} <= ${until + 'T23:59:59Z'}::timestamptz`,
      ));

    // Money out — bills marked paid in window. We use issueDate as a proxy
    // since QB doesn't sync the actual paid-on date for every bill.
    const billRows = await db
      .select({
        totalAmount: bills.totalAmount,
        balance: bills.balance,
        issueDate: bills.issueDate,
        status: bills.status,
      })
      .from(bills)
      .where(and(
        eq(bills.orgId, org.id),
        gte(bills.issueDate, since),
        lte(bills.issueDate, until),
      ));

    // Bucket by YYYY-MM
    type Bucket = { month: string; in: number; out: number; net: number };
    const byMonth = new Map<string, Bucket>();

    function key(d: string | Date | null): string | null {
      if (!d) return null;
      const date = typeof d === 'string' ? new Date(d) : d;
      if (isNaN(date.getTime())) return null;
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    function bump(month: string, field: 'in' | 'out', amt: number) {
      const b = byMonth.get(month) || { month, in: 0, out: 0, net: 0 };
      b[field] += amt;
      byMonth.set(month, b);
    }

    let totalIn = 0;
    for (const p of paymentRows) {
      const m = key(p.paidAt);
      if (!m) continue;
      const a = Number(p.amount ?? 0);
      bump(m, 'in', a);
      totalIn += a;
    }

    let totalOut = 0;
    for (const b of billRows) {
      const m = key(b.issueDate);
      if (!m) continue;
      // Money out = total - balance (the portion actually paid).
      const total = Number(b.totalAmount ?? 0);
      const bal = Number(b.balance ?? 0);
      const paid = Math.max(0, total - bal);
      if (paid <= 0) continue;
      bump(m, 'out', paid);
      totalOut += paid;
    }

    // Fill missing months between since and until so the chart has continuous bars
    const start = new Date(since);
    const end = new Date(until);
    start.setUTCDate(1);
    while (start <= end) {
      const m = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(m)) byMonth.set(m, { month: m, in: 0, out: 0, net: 0 });
      start.setUTCMonth(start.getUTCMonth() + 1);
    }

    const months = [...byMonth.values()]
      .map((b) => ({ ...b, net: Number((b.in - b.out).toFixed(2)) }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
      months,
      totals: {
        in: Number(totalIn.toFixed(2)),
        out: Number(totalOut.toFixed(2)),
        net: Number((totalIn - totalOut).toFixed(2)),
      },
      window: { since, until, monthsBack },
    });
  } catch (err: any) {
    console.error('Cash flow failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
