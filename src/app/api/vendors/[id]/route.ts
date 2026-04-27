import { NextRequest, NextResponse } from 'next/server';
import { db, vendors, bills, purchaseOrders } from '@/db';
import { and, eq, sql, desc } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

// GET /api/vendors/[id]
// Vendor detail + unified transactions timeline (bills + POs).
// Recent first, capped at 200 entries; the UI can paginate via ?limit / ?since.

type TxnType = 'bill' | 'po';
type Txn = {
  type: TxnType;
  id: string;
  number: string | null;
  date: string | null;
  status: string | null;
  total: number;
  balance: number; // for POs, balance = total when open, else 0
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(500, Math.max(20, parseInt(searchParams.get('limit') || '200', 10)));
    const typeFilter = (searchParams.get('type') || 'all').toLowerCase(); // all | bill | po

    const org = await getOrCreateDefaultOrg();

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.orgId, org.id), eq(vendors.id, id)))
      .limit(1);
    if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });

    const txns: Txn[] = [];

    if (typeFilter !== 'po') {
      const billRows = await db
        .select({
          id: bills.id,
          number: bills.billNumber,
          date: bills.issueDate,
          dueDate: bills.dueDate,
          status: bills.status,
          total: bills.totalAmount,
          balance: bills.balance,
        })
        .from(bills)
        .where(and(eq(bills.orgId, org.id), eq(bills.vendorId, id)))
        .orderBy(desc(bills.issueDate))
        .limit(limit);
      for (const b of billRows) {
        txns.push({
          type: 'bill',
          id: b.id,
          number: b.number,
          date: b.date,
          status: b.status,
          total: Number(b.total ?? 0),
          balance: Number(b.balance ?? 0),
        });
      }
    }

    if (typeFilter !== 'bill') {
      const poRows = await db
        .select({
          id: purchaseOrders.id,
          number: purchaseOrders.poNumber,
          date: purchaseOrders.issueDate,
          status: purchaseOrders.status,
          total: purchaseOrders.totalAmount,
        })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.orgId, org.id), eq(purchaseOrders.vendorId, id)))
        .orderBy(desc(purchaseOrders.issueDate))
        .limit(limit);
      for (const p of poRows) {
        const total = Number(p.total ?? 0);
        txns.push({
          type: 'po',
          id: p.id,
          number: p.number,
          date: p.date,
          status: p.status,
          total,
          balance: p.status === 'open' ? total : 0,
        });
      }
    }

    // Unified ordering by date desc; nulls last
    txns.sort((a, b) => {
      const ax = a.date ? new Date(a.date).getTime() : -Infinity;
      const bx = b.date ? new Date(b.date).getTime() : -Infinity;
      return bx - ax;
    });

    // Roll-ups
    const billRoll = txns.filter((t) => t.type === 'bill');
    const poRoll = txns.filter((t) => t.type === 'po');

    return NextResponse.json({
      vendor: {
        ...vendor,
        balance: vendor.balance != null ? Number(vendor.balance) : 0,
      },
      summary: {
        billCount: billRoll.length,
        openBillCount: billRoll.filter((t) => t.balance > 0).length,
        billOpenBalance: billRoll.reduce((s, t) => s + (t.balance || 0), 0),
        billTotalBilled: billRoll.reduce((s, t) => s + (t.total || 0), 0),
        poCount: poRoll.length,
        openPOCount: poRoll.filter((t) => t.status === 'open').length,
        poOpenValue: poRoll.filter((t) => t.status === 'open').reduce((s, t) => s + (t.total || 0), 0),
        lastActivity: txns[0]?.date ?? null,
      },
      transactions: txns,
    });
  } catch (err: any) {
    console.error('Vendor detail failed:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
