import { NextRequest, NextResponse } from 'next/server';
import { db, bills, vendors } from '@/db';
import { and, eq, sql, desc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/reports/ap-aging
// Open bill balances bucketed by days overdue, grouped by vendor.
// Mirrors /api/reports/ar-aging.

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

    const rows = await db
      .select({
        billId: bills.id,
        billNumber: bills.billNumber,
        issueDate: bills.issueDate,
        dueDate: bills.dueDate,
        balance: bills.balance,
        totalAmount: bills.totalAmount,
        status: bills.status,
        vendorId: vendors.id,
        vendorName: vendors.displayName,
        vendorEmail: vendors.email,
        vendorPhone: vendors.phone,
      })
      .from(bills)
      .leftJoin(vendors, eq(vendors.id, bills.vendorId))
      .where(and(
        eq(bills.orgId, org.id),
        sql`${bills.balance} > 0`,
      ))
      .orderBy(desc(bills.dueDate));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type VendorGroup = {
      vendorId: string | null;
      vendorName: string;
      vendorEmail: string | null;
      vendorPhone: string | null;
      buckets: Record<Bucket, number>;
      totalBalance: number;
      bills: Array<{
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

    const byVendor = new Map<string, VendorGroup>();
    const totals: Record<Bucket, number> = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 };
    let billCount = 0;

    for (const r of rows) {
      const balance = Number(r.balance ?? 0);
      if (balance <= 0) continue;

      const dueDate = r.dueDate ? new Date(r.dueDate) : (r.issueDate ? new Date(r.issueDate) : today);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400_000);
      const bucket = bucketize(daysOverdue);

      if (onlyOverdue && bucket === 'current') continue;

      const key = r.vendorId || `unknown:${r.billId}`;
      let g = byVendor.get(key);
      if (!g) {
        g = {
          vendorId: r.vendorId ?? null,
          vendorName: r.vendorName || 'Unknown vendor',
          vendorEmail: r.vendorEmail ?? null,
          vendorPhone: r.vendorPhone ?? null,
          buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 },
          totalBalance: 0,
          bills: [],
        };
        byVendor.set(key, g);
      }
      g.buckets[bucket] += balance;
      g.totalBalance += balance;
      g.bills.push({
        id: r.billId,
        number: r.billNumber,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        balance,
        totalAmount: Number(r.totalAmount ?? 0),
        daysOverdue,
        bucket,
      });
      totals[bucket] += balance;
      billCount++;
    }

    const vendorGroups = [...byVendor.values()]
      .filter((g) => g.totalBalance >= minBalance)
      .sort((a, b) => b.totalBalance - a.totalBalance);

    const grandTotal = BUCKETS.reduce((s, b) => s + totals[b], 0);
    const overdueTotal = totals.d1_30 + totals.d31_60 + totals.d61_90 + totals.d91_plus;

    return NextResponse.json({
      vendors: vendorGroups,
      buckets: totals,
      grandTotal,
      overdueTotal,
      billCount,
      vendorCount: vendorGroups.length,
    });
  } catch (err: any) {
    console.error('A/P aging failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
