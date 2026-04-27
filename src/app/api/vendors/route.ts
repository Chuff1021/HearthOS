import { NextRequest, NextResponse } from 'next/server';
import { db, vendors, bills, purchaseOrders } from '@/db';
import { and, eq, sql, ilike, or, desc, asc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/vendors
// QB-style vendor center list. Rolled-up per-vendor stats:
//   balance        : sum of unpaid bill balance
//   billCount      : total bills
//   openBillCount  : bills with balance > 0
//   poCount        : total POs
//   openPOCount    : POs with status = 'open'
//   lastActivity   : max(issueDate) across bills + POs
//
// All in one query bundle so the page loads fast even at 358 vendors.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const filter = (searchParams.get('filter') || 'active').toLowerCase(); // active | all | with_balance | 1099 | inactive
    const sort = (searchParams.get('sort') || 'name').toLowerCase(); // name | balance | activity
    const dir = (searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    const org = await getOrCreateDefaultOrg();

    const where: any[] = [eq(vendors.orgId, org.id)];
    if (q) {
      const like = `%${q}%`;
      where.push(or(
        ilike(vendors.displayName, like),
        ilike(vendors.companyName, like),
        ilike(vendors.email, like),
      ));
    }
    if (filter === 'active') where.push(eq(vendors.isActive, true));
    if (filter === 'inactive') where.push(eq(vendors.isActive, false));
    if (filter === '1099') where.push(eq(vendors.is1099, true));

    // Bill stats per vendor
    const billStats = await db
      .select({
        vendorId: bills.vendorId,
        balance: sql<number>`COALESCE(SUM(${bills.balance}), 0)::numeric(14,2)`,
        billCount: sql<number>`count(*)::int`,
        openBillCount: sql<number>`count(*) FILTER (WHERE ${bills.balance} > 0)::int`,
        lastBillDate: sql<string | null>`MAX(${bills.issueDate})`,
      })
      .from(bills)
      .where(eq(bills.orgId, org.id))
      .groupBy(bills.vendorId);

    const billByVendor = new Map<string, typeof billStats[number]>();
    for (const b of billStats) if (b.vendorId) billByVendor.set(b.vendorId, b);

    // PO stats per vendor
    const poStats = await db
      .select({
        vendorId: purchaseOrders.vendorId,
        poCount: sql<number>`count(*)::int`,
        openPOCount: sql<number>`count(*) FILTER (WHERE ${purchaseOrders.status} = 'open')::int`,
        lastPODate: sql<string | null>`MAX(${purchaseOrders.issueDate})`,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.orgId, org.id))
      .groupBy(purchaseOrders.vendorId);

    const poByVendor = new Map<string, typeof poStats[number]>();
    for (const p of poStats) if (p.vendorId) poByVendor.set(p.vendorId, p);

    // Vendor rows
    const rows = await db.select().from(vendors).where(and(...where));

    let items = rows.map((v) => {
      const b = billByVendor.get(v.id);
      const p = poByVendor.get(v.id);
      const balance = b ? Number(b.balance) : 0;
      const billCount = b ? b.billCount : 0;
      const openBillCount = b ? b.openBillCount : 0;
      const poCount = p ? p.poCount : 0;
      const openPOCount = p ? p.openPOCount : 0;
      const dates = [b?.lastBillDate, p?.lastPODate].filter(Boolean) as string[];
      const lastActivity = dates.length > 0
        ? dates.reduce((a, x) => (a > x ? a : x), dates[0])
        : null;
      return {
        id: v.id,
        qbVendorId: v.qbVendorId,
        displayName: v.displayName,
        companyName: v.companyName,
        email: v.email,
        phone: v.phone,
        is1099: !!v.is1099,
        isActive: v.isActive ?? true,
        addressLine1: v.addressLine1,
        city: v.city,
        state: v.state,
        zip: v.zip,
        accountNumber: v.accountNumber,
        paymentTerms: v.paymentTerms,
        balance,
        billCount,
        openBillCount,
        poCount,
        openPOCount,
        lastActivity,
      };
    });

    // Apply 'with_balance' post-aggregation
    if (filter === 'with_balance') items = items.filter((i) => i.balance > 0);

    // Sort
    items.sort((a, b) => {
      let c = 0;
      if (sort === 'balance') c = a.balance - b.balance;
      else if (sort === 'activity') {
        const ax = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const bx = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        c = ax - bx;
      } else {
        c = (a.displayName || '').localeCompare(b.displayName || '');
      }
      return dir === 'desc' ? -c : c;
    });

    // Aggregate totals (across the filtered set)
    const totals = items.reduce(
      (acc, x) => ({
        vendors: acc.vendors + 1,
        balance: acc.balance + x.balance,
        openBills: acc.openBills + x.openBillCount,
        openPOs: acc.openPOs + x.openPOCount,
      }),
      { vendors: 0, balance: 0, openBills: 0, openPOs: 0 }
    );

    // Money bar — overall AP picture, ignores list filter so it reflects the
    // business-wide situation (overdue, YTD spend, etc.).
    const today = new Date().toISOString().slice(0, 10);
    const yearStart = `${new Date().getFullYear()}-01-01`;

    const [openAP] = await db
      .select({
        totalOwed: sql<number>`COALESCE(SUM(${bills.balance}), 0)::numeric(14,2)`,
        openCount: sql<number>`count(*) FILTER (WHERE ${bills.balance} > 0)::int`,
      })
      .from(bills)
      .where(eq(bills.orgId, org.id));

    const [overdue] = await db
      .select({
        amount: sql<number>`COALESCE(SUM(${bills.balance}), 0)::numeric(14,2)`,
        count: sql<number>`count(*)::int`,
      })
      .from(bills)
      .where(and(
        eq(bills.orgId, org.id),
        sql`${bills.balance} > 0`,
        sql`${bills.dueDate} IS NOT NULL AND ${bills.dueDate} < ${today}::date`,
      ));

    const [openPO] = await db
      .select({
        value: sql<number>`COALESCE(SUM(${purchaseOrders.totalAmount}), 0)::numeric(14,2)`,
        count: sql<number>`count(*)::int`,
      })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.orgId, org.id), eq(purchaseOrders.status, 'open')));

    const [ytd] = await db
      .select({
        amount: sql<number>`COALESCE(SUM(${bills.totalAmount}), 0)::numeric(14,2)`,
        count: sql<number>`count(*)::int`,
      })
      .from(bills)
      .where(and(
        eq(bills.orgId, org.id),
        sql`${bills.issueDate} >= ${yearStart}::date`,
      ));

    return NextResponse.json({
      items,
      totals,
      moneyBar: {
        totalOwed: Number(openAP?.totalOwed || 0),
        openBillCount: openAP?.openCount || 0,
        overdueAmount: Number(overdue?.amount || 0),
        overdueCount: overdue?.count || 0,
        openPOValue: Number(openPO?.value || 0),
        openPOCount: openPO?.count || 0,
        ytdSpend: Number(ytd?.amount || 0),
        ytdBillCount: ytd?.count || 0,
      },
    });
  } catch (err: any) {
    console.error('Vendor list failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
