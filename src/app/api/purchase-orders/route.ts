import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db, purchaseOrderLineItems, purchaseOrders, vendors } from '@/db';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { isSmtpConfigured, parseEmailList, sendSmtpEmail } from '@/lib/email/smtp';
import { renderPurchaseOrderPdf } from '@/lib/purchase-orders/pdf';

type PurchaseOrderLineInput = {
  itemId?: string;
  itemName?: string;
  partNumber?: string;
  description?: string;
  qty?: number;
  unitPrice?: number;
  amount?: number;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function money(value: number | undefined) {
  return Number(value || 0).toFixed(2);
}

function normalizeLookup(value: string | undefined | null) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function descriptionWithSku(description: string | undefined | null, sku: string | undefined | null) {
  const cleanedDescription = (description || '').trim();
  const cleanedSku = (sku || '').trim();
  if (!cleanedSku) return cleanedDescription || undefined;
  if (normalizeLookup(cleanedDescription).includes(normalizeLookup(cleanedSku))) return cleanedDescription;
  return cleanedDescription ? `${cleanedSku} - ${cleanedDescription}` : cleanedSku;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanLine(line: PurchaseOrderLineInput, idx: number) {
  const qty = Number(line.qty || 0);
  const unitPrice = Number(line.unitPrice || 0);
  const amount = Number(line.amount || qty * unitPrice || 0);
  const partNumber = (line.partNumber || '').trim();
  const itemName = (line.itemName || '').trim();
  const description = descriptionWithSku(line.description || itemName || partNumber || `Item ${idx + 1}`, partNumber) || `Item ${idx + 1}`;

  return {
    qbItemId: line.itemId || null,
    description,
    qty,
    unitPrice,
    amount,
    itemName,
    partNumber,
  };
}

type CleanPurchaseOrderLine = ReturnType<typeof cleanLine>;

function privateNoteFromBody(body: any) {
  return [
    body.shipTo ? `Ship to: ${body.shipTo}` : undefined,
    body.shipVia ? `Ship via: ${body.shipVia}` : undefined,
    body.tags ? `Tags: ${body.tags}` : undefined,
    body.ccBcc ? `Cc/Bcc: ${body.ccBcc}` : undefined,
    body.sourceEstimateId ? `Source estimate: ${body.sourceEstimateId}` : undefined,
  ].filter(Boolean).join('\n') || undefined;
}

function shapePurchaseOrder(po: typeof purchaseOrders.$inferSelect, vendor?: typeof vendors.$inferSelect | null) {
  const docNumber = po.poNumber?.replace(/^QB-/i, '') || po.id;
  return {
    Id: po.id,
    DocNumber: docNumber,
    TxnDate: po.issueDate || undefined,
    DueDate: po.expectedDate || undefined,
    POStatus: po.status ? po.status.charAt(0).toUpperCase() + po.status.slice(1) : 'Open',
    VendorRef: vendor ? { value: vendor.id, name: vendor.displayName } : undefined,
    TotalAmt: Number(po.totalAmount || 0),
    EmailStatus: po.emailStatus || undefined,
  };
}

function purchaseOrderEmailText(poNumber: string, body: any, lines: CleanPurchaseOrderLine[]) {
  return [
    `Purchase Order ${poNumber}`.trim(),
    body.memo ? `Memo: ${body.memo}` : undefined,
    body.shipTo ? `Ship to: ${body.shipTo}` : undefined,
    body.shippingAddress ? `Shipping address:\n${body.shippingAddress}` : undefined,
    body.shipVia ? `Ship via: ${body.shipVia}` : undefined,
    '',
    'Items:',
    ...lines.map((line, idx) => `${idx + 1}. ${line.description} | Qty ${line.qty} | Rate $${money(line.unitPrice)} | Amount $${money(line.amount)}`),
  ].filter((part) => part !== undefined).join('\n');
}

function purchaseOrderEmailHtml(poNumber: string, body: any, lines: CleanPurchaseOrderLine[]) {
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const rows = lines.map((line, idx) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${idx + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.description)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${line.qty}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${money(line.unitPrice)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${money(line.amount)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h1 style="font-size:22px;margin:0 0 6px;">Purchase Order ${escapeHtml(poNumber)}</h1>
      ${body.memo ? `<p style="margin:0 0 16px;color:#4b5563;">${escapeHtml(body.memo)}</p>` : ''}
      <table style="width:100%;margin:16px 0;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;width:50%;padding-right:16px;">
            <strong>Ship to</strong><br />
            ${escapeHtml(body.shipTo || '').replace(/\n/g, '<br />')}<br />
            ${escapeHtml(body.shippingAddress || '').replace(/\n/g, '<br />')}
          </td>
          <td style="vertical-align:top;width:50%;">
            <strong>PO Date</strong>: ${escapeHtml(body.txnDate || '')}<br />
            <strong>Due Date</strong>: ${escapeHtml(body.dueDate || '')}<br />
            <strong>Ship Via</strong>: ${escapeHtml(body.shipVia || '')}
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px;text-align:left;">#</th>
            <th style="padding:8px;text-align:left;">Product/service</th>
            <th style="padding:8px;text-align:right;">Qty</th>
            <th style="padding:8px;text-align:right;">Rate</th>
            <th style="padding:8px;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:18px;font-weight:700;text-align:right;margin-top:16px;">Total: $${money(total)}</p>
    </div>
  `;
}

async function resolveVendor(orgId: string, vendorId: string) {
  const where = isUuid(vendorId)
    ? and(eq(vendors.orgId, orgId), or(eq(vendors.id, vendorId), eq(vendors.qbVendorId, vendorId)))
    : and(eq(vendors.orgId, orgId), eq(vendors.qbVendorId, vendorId));

  const [vendor] = await db.select().from(vendors).where(where).limit(1);
  return vendor || null;
}

async function nextPoNumber(orgId: string, requested?: string) {
  if (requested?.trim()) return requested.trim();

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.orgId, orgId), sql`${purchaseOrders.poNumber} like ${`PO-${today}-%`}`));
  return `PO-${today}-${String((row?.count || 0) + 1).padStart(3, '0')}`;
}

async function sendPurchaseOrderEmail(poNumber: string, body: any, lines: CleanPurchaseOrderLine[], vendorName: string) {
  if (!body.email) return { sent: false as const, sentVia: null };
  if (!isSmtpConfigured()) return { sent: false as const, sentVia: null };

  const pdf = await renderPurchaseOrderPdf({
    poNumber,
    txnDate: body.txnDate,
    vendorName,
    mailingAddress: body.mailingAddress,
    shipTo: body.shipTo,
    shippingAddress: body.shippingAddress,
    lines: lines.map((line) => ({
      itemName: line.itemName,
      partNumber: line.partNumber,
      description: line.description,
      qty: line.qty,
      unitPrice: line.unitPrice,
      amount: line.amount,
    })),
  });

  await sendSmtpEmail({
    to: body.email,
    cc: parseEmailList(body.ccBcc),
    bcc: body.sendMeCopy === false ? undefined : parseEmailList(process.env.SMTP_FROM || process.env.SMTP_USER),
    subject: body.emailSubject || `Purchase Order ${poNumber} from AARON'S FIREPLACE CO, LLC`,
    text: body.emailBody || purchaseOrderEmailText(poNumber, body, lines),
    html: body.emailBody
      ? `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(body.emailBody)}</div>`
      : purchaseOrderEmailHtml(poNumber, body, lines),
    attachments: [{
      filename: `Purchase Order ${poNumber || 'PO'}.pdf`,
      content: pdf,
      contentType: 'application/pdf',
    }],
  });

  return { sent: true as const, sentVia: 'smtp' };
}

export async function GET() {
  try {
    const org = await getOrCreateDefaultOrg();
    const rows = await db
      .select({ po: purchaseOrders, vendor: vendors })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(eq(purchaseOrders.orgId, org.id))
      .orderBy(desc(purchaseOrders.issueDate), desc(purchaseOrders.createdAt))
      .limit(300);

    const shaped = rows.map((row) => shapePurchaseOrder(row.po, row.vendor));
    return NextResponse.json({ purchaseOrders: shaped, total: shaped.length, source: 'hearth' });
  } catch (err) {
    console.error('Failed to get Hearth purchase orders:', err);
    return NextResponse.json({ error: 'Failed to get purchase orders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const org = await getOrCreateDefaultOrg();
    const body = await request.json();

    if (!body.vendorId || !Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ error: 'vendorId and lines[] are required' }, { status: 400 });
    }

    const vendor = await resolveVendor(org.id, String(body.vendorId));
    if (!vendor) return NextResponse.json({ error: 'Vendor was not found in Hearth OS' }, { status: 404 });

    const lines: CleanPurchaseOrderLine[] = body.lines
      .map((line: PurchaseOrderLineInput, idx: number) => cleanLine(line, idx))
      .filter((line: CleanPurchaseOrderLine) => line.qty > 0 && line.unitPrice >= 0 && line.amount > 0);

    if (!lines.length) return NextResponse.json({ error: 'Add at least one line with quantity and price.' }, { status: 400 });

    const poNumber = await nextPoNumber(org.id, body.poNumber);
    const subtotal = lines.reduce((sum: number, line: CleanPurchaseOrderLine) => sum + line.amount, 0);
    const txnDate = body.txnDate || new Date().toISOString().slice(0, 10);

    const existing = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.orgId, org.id), eq(purchaseOrders.vendorId, vendor.id), eq(purchaseOrders.poNumber, poNumber)))
      .limit(1);

    const baseValues = {
      vendorId: vendor.id,
      poNumber,
      status: 'open' as const,
      issueDate: txnDate,
      expectedDate: body.dueDate || null,
      subtotal: String(subtotal.toFixed(2)),
      taxAmount: '0',
      totalAmount: String(subtotal.toFixed(2)),
      shipAddress: body.shippingAddress || null,
      vendorMessage: body.emailBody || body.memo || null,
      privateNote: privateNoteFromBody(body),
      emailStatus: body.send ? 'pending' : 'not_sent',
      updatedAt: new Date(),
    };

    const [created] = existing[0]
      ? await db.update(purchaseOrders).set(baseValues).where(eq(purchaseOrders.id, existing[0].id)).returning()
      : await db.insert(purchaseOrders).values({
          orgId: org.id,
          qbPurchaseOrderId: null,
          lastSyncedAt: null,
          ...baseValues,
        }).returning();

    await db.delete(purchaseOrderLineItems).where(eq(purchaseOrderLineItems.purchaseOrderId, created.id));

    await db.insert(purchaseOrderLineItems).values(lines.map((line, idx) => ({
      purchaseOrderId: created.id,
      qbItemId: line.qbItemId,
      description: line.description,
      quantity: String(line.qty),
      unitCost: String(line.unitPrice),
      total: String(line.amount.toFixed(2)),
      order: idx,
    })));

    let sentVia: string | null = null;
    let emailError: string | null = null;

    if (body.send) {
      try {
        const result = await sendPurchaseOrderEmail(poNumber, body, lines, vendor.displayName);
        if (result.sent) sentVia = result.sentVia;
      } catch (sendErr) {
        emailError = sendErr instanceof Error ? sendErr.message : 'Failed to send email';
      }

      await db.update(purchaseOrders).set({
        emailStatus: sentVia ? 'sent' : `failed${emailError ? `: ${emailError}` : ''}`.slice(0, 50),
        updatedAt: new Date(),
      }).where(eq(purchaseOrders.id, created.id));
      created.emailStatus = sentVia ? 'sent' : 'failed';
    }

    return NextResponse.json({
      purchaseOrder: shapePurchaseOrder({ ...created, emailStatus: sentVia ? 'sent' : created.emailStatus }, vendor),
      sent: Boolean(body.send && sentVia),
      sentVia,
      emailError,
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create Hearth purchase order:', err);
    const message = err instanceof Error ? err.message : 'Failed to create purchase order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
