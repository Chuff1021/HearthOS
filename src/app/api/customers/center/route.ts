import { NextRequest, NextResponse } from 'next/server';
import { db, customers, invoices, payments, properties } from '@/db';
import { and, desc, eq, sql, ilike, inArray, or } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { authorizeApi } from '@/lib/tenant/api-authorization';

// GET /api/customers/center
// Customer center list with rolled-up A/R + revenue stats per customer
// and a money bar of business-wide totals (A/R, overdue, revenue YTD).
//
// Lives on /center to avoid clashing with the legacy /api/customers used
// by older surfaces (data-store backed search/CRUD).

export async function GET(req: NextRequest) {
  const denied = await authorizeApi('customers:read');
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const filter = (searchParams.get('filter') || 'active').toLowerCase();
    const sort = (searchParams.get('sort') || 'name').toLowerCase();
    const dir = (searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    const org = await getOrCreateDefaultOrg();

    const where: any[] = [eq(customers.orgId, org.id)];
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
      for (const term of terms) {
        const like = `%${term}%`;
        where.push(or(
          ilike(customers.firstName, like),
          ilike(customers.lastName, like),
          ilike(customers.companyName, like),
          ilike(customers.email, like),
          ilike(customers.phone, like),
          ilike(customers.addressLine1, like),
          ilike(customers.city, like),
          ilike(customers.zip, like),
          sql<boolean>`concat_ws(' ', ${customers.firstName}, ${customers.lastName}) ilike ${like}`,
          sql<boolean>`exists (
            select 1 from ${properties}
            where ${properties.customerId} = ${customers.id}
              and ${properties.orgId} = ${org.id}
              and concat_ws(' ', ${properties.address}, ${properties.city}, ${properties.state}, ${properties.zip}) ilike ${like}
          )`,
        ));
      }
    }
    if (filter === 'active') where.push(eq(customers.isActive, true));
    if (filter === 'inactive') where.push(eq(customers.isActive, false));

    const invStats = await db
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
      .groupBy(invoices.customerId);
    const invByCust = new Map<string, typeof invStats[number]>();
    for (const r of invStats) if (r.customerId) invByCust.set(r.customerId, r);

    const payStats = await db
      .select({
        customerId: invoices.customerId,
        paymentCount: sql<number>`count(*)::int`,
        lastPaymentDate: sql<string | null>`MAX(${payments.paidAt})::text`,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(eq(payments.orgId, org.id))
      .groupBy(invoices.customerId);
    const payByCust = new Map<string, typeof payStats[number]>();
    for (const r of payStats) if (r.customerId) payByCust.set(r.customerId, r);

    const rows = await db.select().from(customers).where(and(...where));
    const propertyRows = rows.length > 0
      ? await db
          .select()
          .from(properties)
          .where(and(
            eq(properties.orgId, org.id),
            inArray(properties.customerId, rows.map((row) => row.id)),
          ))
          .orderBy(desc(properties.isPrimary), desc(properties.updatedAt))
      : [];
    const primaryPropertyByCustomer = new Map<string, typeof properties.$inferSelect>();
    for (const property of propertyRows) {
      if (!primaryPropertyByCustomer.has(property.customerId)) {
        primaryPropertyByCustomer.set(property.customerId, property);
      }
    }

    let items = rows.map((c) => {
      const property = primaryPropertyByCustomer.get(c.id);
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
        addressLine1: property?.address || c.addressLine1,
        addressLine2: property ? null : c.addressLine2,
        city: property?.city || c.city,
        state: property?.state || c.state,
        zip: property?.zip || c.zip,
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

    const today = new Date().toISOString().slice(0, 10);
    const yearStart = `${new Date().getFullYear()}-01-01`;

    const [openAR] = await db
      .select({
        totalDue: sql<number>`COALESCE(SUM(${invoices.balance}), 0)::numeric(14,2)`,
        openCount: sql<number>`count(*) FILTER (WHERE ${invoices.balance} > 0)::int`,
      })
      .from(invoices)
      .where(eq(invoices.orgId, org.id));

    const [overdue] = await db
      .select({
        amount: sql<number>`COALESCE(SUM(${invoices.balance}), 0)::numeric(14,2)`,
        count: sql<number>`count(*)::int`,
      })
      .from(invoices)
      .where(and(
        eq(invoices.orgId, org.id),
        sql`${invoices.balance} > 0`,
        sql`${invoices.dueDate} IS NOT NULL AND ${invoices.dueDate} < ${today}::date`,
      ));

    const [ytd] = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${invoices.subtotal}), 0)::numeric(14,2)`,
        count: sql<number>`count(*)::int`,
      })
      .from(invoices)
      .where(and(
        eq(invoices.orgId, org.id),
        sql`${invoices.issueDate} >= ${yearStart}::date`,
      ));

    return NextResponse.json({
      items,
      totals,
      moneyBar: {
        totalDue: Number(openAR?.totalDue || 0),
        openInvoiceCount: openAR?.openCount || 0,
        overdueAmount: Number(overdue?.amount || 0),
        overdueCount: overdue?.count || 0,
        revenueYTD: Number(ytd?.revenue || 0),
        ytdInvoiceCount: ytd?.count || 0,
      },
    });
  } catch (err: any) {
    console.error('Customer center list failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
