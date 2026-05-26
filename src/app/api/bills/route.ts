import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db, bills, vendors } from '@/db';
import { getOrCreateDefaultOrg } from '@/lib/org';

function money(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

async function nextBillNumber(orgId: string, requested?: string) {
  if (requested?.trim()) return requested.trim();

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bills)
    .where(and(eq(bills.orgId, orgId), sql`${bills.billNumber} like ${`BILL-${today}-%`}`));

  return `BILL-${today}-${String((row?.count || 0) + 1).padStart(3, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const org = await getOrCreateDefaultOrg();
    const body = await request.json();
    const vendorId = String(body.vendorId || '');
    const total = Number(body.totalAmount || 0);

    if (!vendorId) return NextResponse.json({ error: 'vendorId is required' }, { status: 400 });
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ error: 'Bill amount must be greater than zero' }, { status: 400 });
    }

    const [vendor] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.orgId, org.id), eq(vendors.id, vendorId)))
      .limit(1);

    if (!vendor) return NextResponse.json({ error: 'Vendor was not found in Hearth OS' }, { status: 404 });

    const issueDate = body.issueDate || new Date().toISOString().slice(0, 10);
    const billNumber = await nextBillNumber(org.id, body.billNumber);
    const amount = money(total);

    const [bill] = await db.insert(bills).values({
      orgId: org.id,
      vendorId: vendor.id,
      qbBillId: null,
      billNumber,
      status: 'open',
      issueDate,
      dueDate: body.dueDate || null,
      subtotal: amount,
      taxAmount: '0.00',
      totalAmount: amount,
      balance: amount,
      privateNote: typeof body.privateNote === 'string' && body.privateNote.trim() ? body.privateNote.trim() : null,
      paymentTerms: null,
      lastSyncedAt: null,
      updatedAt: new Date(),
    }).returning();

    return NextResponse.json({ bill }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create bill:', err);
    return NextResponse.json({ error: err?.message || 'Failed to create bill' }, { status: 500 });
  }
}
