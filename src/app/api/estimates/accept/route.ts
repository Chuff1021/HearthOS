import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, or } from 'drizzle-orm';
import { db, customers, estimateLineItems, estimates, inventoryItems } from '@/db';
import { getOrCreateDefaultOrg } from '@/lib/org';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanEstimateId(value: string | null) {
  return (value || '').replace(/^QB-/i, '').trim();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function contractText(estimateNumber: string, customerName: string, total: number) {
  return [
    `Estimate ${estimateNumber} Service Agreement`,
    '',
    `Customer: ${customerName}`,
    `Estimate total: $${Number(total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    '',
    "By accepting this estimate, the customer authorizes AARON'S FIREPLACE CO, LLC to perform the work described in the estimate. The customer agrees to pay the approved estimate amount and any separately approved change orders, additional parts, labor, taxes, fees, or services required to complete the work.",
    '',
    'Scheduling is subject to availability, weather, parts availability, and site readiness. Once the estimate is accepted, AARON\'S FIREPLACE CO, LLC will contact the customer to schedule the work.',
    '',
    'Payment is due according to the invoice or payment terms provided. Card payments may include a processing fee. E-check or paper check payment options may be available.',
  ].join('\n');
}

async function findEstimate(orgId: string, estimateId: string) {
  const id = cleanEstimateId(estimateId);
  const filters = [
    eq(estimates.qbEstimateId, id),
    eq(estimates.estimateNumber, id),
    eq(estimates.estimateNumber, `QB-${id}`),
  ];
  if (isUuid(id)) filters.push(eq(estimates.id, id));

  const [row] = await db
    .select({
      estimate: estimates,
      customer: customers,
    })
    .from(estimates)
    .leftJoin(customers, eq(customers.id, estimates.customerId))
    .where(and(eq(estimates.orgId, orgId), or(...filters)!))
    .limit(1);

  return row;
}

export async function GET(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const org = await getOrCreateDefaultOrg();
    const row = await findEstimate(org.id, id);
    if (!row) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });

    const lineRows = await db
      .select({
        description: estimateLineItems.description,
        quantity: estimateLineItems.quantity,
        unitPrice: estimateLineItems.unitPrice,
        total: estimateLineItems.total,
        order: estimateLineItems.order,
        itemName: inventoryItems.name,
        itemSku: inventoryItems.sku,
      })
      .from(estimateLineItems)
      .leftJoin(
        inventoryItems,
        and(eq(inventoryItems.orgId, org.id), eq(inventoryItems.qbItemId, estimateLineItems.qbItemId)),
      )
      .where(eq(estimateLineItems.estimateId, row.estimate.id))
      .orderBy(asc(estimateLineItems.order));

    const customerName = row.customer?.companyName
      || [row.customer?.firstName, row.customer?.lastName].filter(Boolean).join(' ').trim()
      || 'Customer';
    const estimateNumber = cleanEstimateId(row.estimate.estimateNumber || row.estimate.qbEstimateId || row.estimate.id);
    const total = Number(row.estimate.totalAmount || 0);

    return NextResponse.json({
      estimate: {
        id: row.estimate.qbEstimateId || row.estimate.id,
        estimateNumber,
        status: row.estimate.status,
        issueDate: row.estimate.issueDate,
        expirationDate: row.estimate.expirationDate,
        totalAmount: total,
        customerName,
        customerEmail: row.customer?.email || row.estimate.billEmail || '',
        contractText: contractText(estimateNumber, customerName, total),
        lines: lineRows.map((line) => ({
          product: line.itemSku || line.itemName || line.description?.split(/\r?\n/)[0] || 'Item',
          description: line.description,
          quantity: Number(line.quantity || 1),
          unitPrice: Number(line.unitPrice || 0),
          total: Number(line.total || 0),
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load estimate acceptance' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const estimateId = body?.id ? String(body.id) : '';
    const signerName = body?.signerName ? String(body.signerName).trim() : '';
    const signerEmail = body?.signerEmail ? String(body.signerEmail).trim() : '';
    const agreed = Boolean(body?.agreed);

    if (!estimateId) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    if (!signerName) return NextResponse.json({ error: 'Enter your name to accept the estimate.' }, { status: 400 });
    if (!agreed) return NextResponse.json({ error: 'You must agree to the service contract to accept.' }, { status: 400 });

    const org = await getOrCreateDefaultOrg();
    const row = await findEstimate(org.id, estimateId);
    if (!row) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });

    const customerName = row.customer?.companyName
      || [row.customer?.firstName, row.customer?.lastName].filter(Boolean).join(' ').trim()
      || signerName;
    const estimateNumber = cleanEstimateId(row.estimate.estimateNumber || row.estimate.qbEstimateId || row.estimate.id);
    const total = Number(row.estimate.totalAmount || 0);
    const acceptedAt = new Date();
    const agreement = [
      contractText(estimateNumber, customerName, total),
      '',
      `Accepted by: ${signerName}`,
      signerEmail ? `Signer email: ${signerEmail}` : undefined,
      `Accepted at: ${acceptedAt.toISOString()}`,
      `Estimate ID: ${row.estimate.qbEstimateId || row.estimate.id}`,
    ].filter(Boolean).join('\n');
    const noteBlock = `\n\n--- Accepted Estimate Agreement ---\n${agreement}`;

    await db.update(estimates).set({
      status: 'accepted',
      acceptedDate: todayDate(),
      privateNote: `${row.estimate.privateNote || ''}${noteBlock}`.trim(),
      updatedAt: acceptedAt,
    }).where(eq(estimates.id, row.estimate.id));

    if (row.customer?.id) {
      await db.update(customers).set({
        notes: `${row.customer.notes || ''}${noteBlock}`.trim(),
        email: row.customer.email || signerEmail || undefined,
        updatedAt: acceptedAt,
      }).where(eq(customers.id, row.customer.id));
    }

    return NextResponse.json({
      success: true,
      estimateNumber,
      message: 'Estimate accepted. We will contact you to schedule the work.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to accept estimate' },
      { status: 500 },
    );
  }
}
