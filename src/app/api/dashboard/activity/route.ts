import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  invoices,
  payments,
  bills,
  purchaseOrders,
  estimates,
  customers,
  vendors,
} from '@/db';
import { and, eq, desc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// Real business activity feed for the dashboard, sourced from the QB-synced
// tables (not the legacy in-memory data-store).
//
// Per-table pull is small (50 rows) and they're indexed; total query budget
// is ~5 indexed range scans. Merge + sort + slice happens in JS.

type ActivityType = 'payment' | 'invoice' | 'estimate' | 'bill' | 'po';

type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  actor: string | null;
  amount: number | null;
  at: string;
  href: string;
  status: string | null;
};

const PER_TABLE = 50;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '30', 10)));
    const org = await getOrCreateDefaultOrg();

    const customerName = (first: string | null, last: string | null, company: string | null) =>
      company || [first, last].filter(Boolean).join(' ').trim() || null;

    const fmtMoney = (n: number) =>
      `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Payments — money in (most exciting)
    const paymentRows = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        method: payments.paymentMethod,
        paidAt: payments.paidAt,
        invoiceId: payments.invoiceId,
        invoiceNumber: invoices.invoiceNumber,
        firstName: customers.firstName,
        lastName: customers.lastName,
        companyName: customers.companyName,
      })
      .from(payments)
      .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(eq(payments.orgId, org.id))
      .orderBy(desc(payments.paidAt))
      .limit(PER_TABLE);

    // Invoices — work going out
    const invoiceRows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        issueDate: invoices.issueDate,
        totalAmount: invoices.totalAmount,
        balance: invoices.balance,
        firstName: customers.firstName,
        lastName: customers.lastName,
        companyName: customers.companyName,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(eq(invoices.orgId, org.id))
      .orderBy(desc(invoices.issueDate))
      .limit(PER_TABLE);

    // Estimates — sales pipeline
    const estimateRows = await db
      .select({
        id: estimates.id,
        estimateNumber: estimates.estimateNumber,
        status: estimates.status,
        issueDate: estimates.issueDate,
        acceptedDate: estimates.acceptedDate,
        totalAmount: estimates.totalAmount,
        firstName: customers.firstName,
        lastName: customers.lastName,
        companyName: customers.companyName,
      })
      .from(estimates)
      .leftJoin(customers, eq(customers.id, estimates.customerId))
      .where(eq(estimates.orgId, org.id))
      .orderBy(desc(estimates.issueDate))
      .limit(PER_TABLE);

    // Bills — money going out
    const billRows = await db
      .select({
        id: bills.id,
        billNumber: bills.billNumber,
        status: bills.status,
        issueDate: bills.issueDate,
        totalAmount: bills.totalAmount,
        balance: bills.balance,
        vendorName: vendors.displayName,
      })
      .from(bills)
      .leftJoin(vendors, eq(vendors.id, bills.vendorId))
      .where(eq(bills.orgId, org.id))
      .orderBy(desc(bills.issueDate))
      .limit(PER_TABLE);

    // Purchase orders — money committed
    const poRows = await db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
        issueDate: purchaseOrders.issueDate,
        totalAmount: purchaseOrders.totalAmount,
        vendorName: vendors.displayName,
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(eq(purchaseOrders.orgId, org.id))
      .orderBy(desc(purchaseOrders.issueDate))
      .limit(PER_TABLE);

    const out: Activity[] = [];

    for (const r of paymentRows) {
      const amt = Number(r.amount ?? 0);
      const at = r.paidAt ? new Date(r.paidAt).toISOString() : '';
      if (!at) continue;
      out.push({
        id: `pay-${r.id}`,
        type: 'payment',
        title: 'Payment received',
        description: `${r.invoiceNumber ? r.invoiceNumber + ' · ' : ''}${fmtMoney(amt)}${r.method ? ' · ' + r.method : ''}`,
        actor: customerName(r.firstName, r.lastName, r.companyName),
        amount: amt,
        at,
        href: r.invoiceId ? `/invoices` : '/payments',
        status: null,
      });
    }

    for (const r of invoiceRows) {
      if (!r.issueDate) continue;
      const amt = Number(r.totalAmount ?? 0);
      const balance = Number(r.balance ?? 0);
      const status = r.status ?? 'draft';
      // Skip "paid" — we already emit a payment event for the actual money in.
      // Keep "sent" / "draft" / "void" since those are state changes worth seeing.
      if (status === 'paid' && balance <= 0.01) continue;
      const title =
        status === 'sent' ? 'Invoice sent' :
        status === 'void' ? 'Invoice voided' :
        status === 'draft' ? 'Invoice drafted' :
        'Invoice updated';
      out.push({
        id: `inv-${r.id}`,
        type: 'invoice',
        title,
        description: `${r.invoiceNumber} · ${fmtMoney(amt)}${balance > 0.01 ? ' · ' + fmtMoney(balance) + ' open' : ''}`,
        actor: customerName(r.firstName, r.lastName, r.companyName),
        amount: amt,
        at: r.issueDate,
        href: '/invoices',
        status,
      });
    }

    for (const r of estimateRows) {
      const at = r.acceptedDate || r.issueDate;
      if (!at) continue;
      const amt = Number(r.totalAmount ?? 0);
      const status = r.status ?? 'pending';
      const title =
        status === 'accepted' ? 'Estimate accepted' :
        status === 'declined' ? 'Estimate declined' :
        status === 'expired' ? 'Estimate expired' :
        status === 'converted' ? 'Estimate → invoice' :
        'Estimate sent';
      out.push({
        id: `est-${r.id}`,
        type: 'estimate',
        title,
        description: `${r.estimateNumber || '—'} · ${fmtMoney(amt)}`,
        actor: customerName(r.firstName, r.lastName, r.companyName),
        amount: amt,
        at,
        href: '/estimates',
        status,
      });
    }

    for (const r of billRows) {
      if (!r.issueDate) continue;
      const amt = Number(r.totalAmount ?? 0);
      const balance = Number(r.balance ?? 0);
      const status = r.status ?? 'open';
      const title = status === 'paid' ? 'Bill paid' : status === 'void' ? 'Bill voided' : 'Bill received';
      out.push({
        id: `bill-${r.id}`,
        type: 'bill',
        title,
        description: `${r.billNumber ? r.billNumber + ' · ' : ''}${fmtMoney(amt)}${balance > 0.01 ? ' · ' + fmtMoney(balance) + ' due' : ''}`,
        actor: r.vendorName,
        amount: amt,
        at: r.issueDate,
        href: '/bills',
        status,
      });
    }

    for (const r of poRows) {
      if (!r.issueDate) continue;
      const amt = Number(r.totalAmount ?? 0);
      const status = r.status ?? 'open';
      const title =
        status === 'closed' ? 'PO closed' :
        status === 'cancelled' ? 'PO cancelled' :
        status === 'partial' ? 'PO partially received' :
        'PO sent';
      out.push({
        id: `po-${r.id}`,
        type: 'po',
        title,
        description: `${r.poNumber ? r.poNumber + ' · ' : ''}${fmtMoney(amt)}`,
        actor: r.vendorName,
        amount: amt,
        at: r.issueDate,
        href: '/purchase-orders',
        status,
      });
    }

    // Sort by date desc — date-only strings (yyyy-mm-dd) and ISO timestamps both
    // sort lexicographically, but pad date-only to a timestamp-shaped string so
    // a payment at 2026-04-28T15:00:00 sorts above an invoice issued 2026-04-28.
    const sortKey = (a: Activity) => (a.at.length === 10 ? a.at + 'T00:00:00.000Z' : a.at);
    out.sort((a, b) => (sortKey(a) > sortKey(b) ? -1 : sortKey(a) < sortKey(b) ? 1 : 0));

    return NextResponse.json({ activity: out.slice(0, limit) });
  } catch (err: any) {
    console.error('Dashboard activity failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
