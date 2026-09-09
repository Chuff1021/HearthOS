import { authorizeCrmApi } from "@/lib/security/crm-access";
import { NextRequest, NextResponse } from 'next/server';
import { db, customers, invoices, payments } from '@/db';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { customerAddress, customerSearchPredicate } from '@/lib/customer-search';

// GET /api/customers/center
// Customer center list with rolled-up A/R + revenue stats per customer
// and a money bar of business-wide totals (A/R, overdue, revenue YTD).
//
// Lives on /center to avoid clashing with the legacy /api/customers used
// by older surfaces (data-store backed search/CRUD).

export async function GET(req: NextRequest) {
  const accessDenied = await authorizeCrmApi("/api/customers/center", "GET");
  if (accessDenied) return accessDenied;
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const filter = (searchParams.get('filter') || 'active').toLowerCase();
    const sort = (searchParams.get('sort') || 'name').toLowerCase();
    const dir = (searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    const org = await getOrCreateDefaultOrg();

    const where: (SQL | undefined)[] = [eq(customers.orgId, org.id)];
    if (q) {
      where.push(customerSearchPredicate(q));
    }
    if (filter === 'active') where.push(eq(customers.isActive, true));
    if (filter === 'inactive') where.push(eq(customers.isActive, false));

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yearStart = `${now.getFullYear()}-01-01`;

    // Independent organization-scoped reads; financial summaries scan invoices once.
    const [invStats, payStats, rows, [money]] = await Promise.all([
      db
      .select({
        customerId: invoices.customerId,
        balance: sql<number>`COALESCE(SUM(${invoices.balance}), 0)::numeric(14,2)`,
        invoiceCount: sql<number>`count(*)::int`,
        openInvoiceCount: sql<number>`count(*) FILTER (WHERE ${invoices.balance} > 0)::int`,
        totalRevenue: sql<number>`COALESCE(SUM(${invoices.subtotal}), 0)::numeric(14,2)`,
        lastInvoiceDate: sql<string | null>`MAX(${invoices.issueDate})`,
      })
      .from(invoices)
      .where(eq(invoices.orgId, org.id))
      .groupBy(invoices.customerId),
      db
      .select({
        customerId: invoices.customerId,
        paymentCount: sql<number>`count(*)::int`,
        lastPaymentDate: sql<string | null>`MAX(${payments.paidAt})::text`,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, org.id), eq(invoices.orgId, org.id)))
      .groupBy(invoices.customerId),
      db.select().from(customers).where(and(...where)),
      db.select({
        totalDue: sql<number>`COALESCE(SUM(${invoices.balance}), 0)::numeric(14,2)`,
        openInvoiceCount: sql<number>`count(*) FILTER (WHERE ${invoices.balance} > 0)::int`,
        overdueAmount: sql<number>`COALESCE(SUM(${invoices.balance}) FILTER (WHERE ${invoices.balance} > 0 AND ${invoices.dueDate} < ${today}::date), 0)::numeric(14,2)`,
        overdueCount: sql<number>`count(*) FILTER (WHERE ${invoices.balance} > 0 AND ${invoices.dueDate} < ${today}::date)::int`,
        revenueYTD: sql<number>`COALESCE(SUM(${invoices.subtotal}) FILTER (WHERE ${invoices.issueDate} >= ${yearStart}::date), 0)::numeric(14,2)`,
        ytdInvoiceCount: sql<number>`count(*) FILTER (WHERE ${invoices.issueDate} >= ${yearStart}::date)::int`,
      }).from(invoices).where(eq(invoices.orgId, org.id)),
    ]);
    const invByCust = new Map<string, typeof invStats[number]>();
    for (const r of invStats) if (r.customerId) invByCust.set(r.customerId, r);
    const payByCust = new Map<string, typeof payStats[number]>();
    for (const r of payStats) if (r.customerId) payByCust.set(r.customerId, r);

    let items = rows.map((c) => {
      const inv = invByCust.get(c.id);
      const pay = payByCust.get(c.id);
      const balance = inv ? Number(inv.balance) : 0;
      const totalRevenue = inv ? Number(inv.totalRevenue) : 0;
      const dates = [inv?.lastInvoiceDate, pay?.lastPaymentDate].filter(Boolean) as string[];
      const lastActivity = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b), dates[0]) : null;
      const displayName =
        c.companyName ||
        [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
        c.email ||
        'Unnamed';
      return {
        id: c.id,
        qbCustomerId: c.qbCustomerId,
        displayName,
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: c.companyName,
        email: c.email,
        phone: c.phone,
        phoneAlt: c.phoneAlt,
        address: customerAddress(c),
        source: c.source,
        isActive: c.isActive ?? true,
        balance,
        invoiceCount: inv ? inv.invoiceCount : 0,
        openInvoiceCount: inv ? inv.openInvoiceCount : 0,
        paymentCount: pay ? pay.paymentCount : 0,
        totalRevenue,
        lastActivity,
      };
    });

    if (filter === 'with_balance') items = items.filter((i) => i.balance > 0);

    items.sort((a, b) => {
      let c = 0;
      if (sort === 'balance') c = a.balance - b.balance;
      else if (sort === 'revenue') c = a.totalRevenue - b.totalRevenue;
      else if (sort === 'activity') {
        const ax = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const bx = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        c = ax - bx;
      } else {
        c = (a.displayName || '').localeCompare(b.displayName || '');
      }
      return dir === 'desc' ? -c : c;
    });

    const totals = items.reduce(
      (acc, x) => ({
        customers: acc.customers + 1,
        balance: acc.balance + x.balance,
        openInvoices: acc.openInvoices + x.openInvoiceCount,
        revenue: acc.revenue + x.totalRevenue,
      }),
      { customers: 0, balance: 0, openInvoices: 0, revenue: 0 }
    );

    return NextResponse.json({
      items,
      totals,
      moneyBar: {
        totalDue: Number(money?.totalDue || 0),
        openInvoiceCount: money?.openInvoiceCount || 0,
        overdueAmount: Number(money?.overdueAmount || 0),
        overdueCount: money?.overdueCount || 0,
        revenueYTD: Number(money?.revenueYTD || 0),
        ytdInvoiceCount: money?.ytdInvoiceCount || 0,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('Customer center list failed:', err);
    return NextResponse.json({ error: 'Unable to load customers. Please try again.' }, { status: 500 });
  }
}
