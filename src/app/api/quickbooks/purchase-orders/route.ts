import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';
import { getClientFromTokens, persistPurchaseOrdersToDb } from '@/lib/quickbooks/sync';
import { isSmtpConfigured, parseEmailList, sendSmtpEmail } from '@/lib/email/smtp';

async function getQBAuth(request: NextRequest) {
  let accessToken = request.cookies.get('qb_access_token')?.value;
  let refreshToken = request.cookies.get('qb_refresh_token')?.value;
  let realmId = request.cookies.get('qb_realm_id')?.value;

  const org = await getOrCreateDefaultOrg();
  if (!accessToken || !refreshToken || !realmId) {
    if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
      accessToken = org.qbAccessToken;
      refreshToken = org.qbRefreshToken;
      realmId = org.qbRealmId;
    }
  }

  if (!accessToken || !refreshToken || !realmId) {
    return { ok: false as const, error: 'Not connected to QuickBooks' };
  }

  return { ok: true as const, accessToken, refreshToken, realmId, orgId: org.id };
}

async function withRefresh<T>(auth: { accessToken: string; refreshToken: string; realmId: string; orgId: string }, fn: (client: any) => Promise<T>) {
  let client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);
  try {
    return await fn(client);
  } catch {
    const tokens = await client.refreshAccessToken();
    await db.update(organizations).set({
      qbAccessToken: tokens.access_token,
      qbRefreshToken: tokens.refresh_token,
      qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(organizations.id, auth.orgId));
    client = getClientFromTokens(tokens.access_token, tokens.refresh_token, auth.realmId);
    return fn(client);
  }
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

function extractPartNumber(description: string | undefined | null) {
  const text = (description || '').trim();
  const partLine = text.match(/\n\s*Part:\s*([^\n]+)/i);
  if (partLine?.[1]) return partLine[1].trim();
  const prefix = text.match(/^([A-Z0-9][A-Z0-9:._/-]{2,})\s+-\s+/i);
  return prefix?.[1]?.trim() || '';
}

function cleanDescription(description: string | undefined | null, partNumber: string | undefined | null) {
  let cleaned = (description || '').replace(/\n\s*Part:\s*.+$/i, '').trim();
  const part = (partNumber || '').trim();
  if (!part) return cleaned;
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cleaned
    .replace(new RegExp(`\\s*\\(${escaped}\\)\\s*$`, 'i'), '')
    .replace(new RegExp(`^${escaped}\\s*-\\s*`, 'i'), '')
    .trim();
}

function addressFromText(value: string | undefined | null) {
  const lines = (value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (lines.length === 0) return undefined;
  return {
    Line1: lines[0],
    Line2: lines[1],
    Line3: lines[2],
    Line4: lines[3],
    Line5: lines[4],
  };
}

function privateNoteFromPurchaseOrderBody(body: any, fallback?: string) {
  const noteParts = [
    fallback,
    body.shipTo ? `Ship to: ${body.shipTo}` : undefined,
    body.shipVia ? `Ship via: ${body.shipVia}` : undefined,
    body.tags ? `Tags: ${body.tags}` : undefined,
    body.ccBcc ? `Cc/Bcc: ${body.ccBcc}` : undefined,
    body.sourceEstimateId ? `Source estimate: ${body.sourceEstimateId}` : undefined,
  ].filter(Boolean);

  return noteParts.length ? noteParts.join('\n') : undefined;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function purchaseOrderEmailText(purchaseOrder: any, body: any) {
  const lines = (body.lines || []).map((line: any, idx: number) => {
    const qty = Number(line.qty || 0);
    const unitPrice = Number(line.unitPrice || 0);
    const amount = Number(line.amount || qty * unitPrice || 0);
    return `${idx + 1}. ${line.itemName || line.partNumber || 'Item'} - ${line.description || ''} | Qty ${qty} | Rate $${unitPrice.toFixed(2)} | Amount $${amount.toFixed(2)}`;
  });

  return [
    `Purchase Order ${purchaseOrder?.DocNumber || purchaseOrder?.Id || ''}`.trim(),
    body.memo ? `Memo: ${body.memo}` : undefined,
    body.shipTo ? `Ship to: ${body.shipTo}` : undefined,
    body.shippingAddress ? `Shipping address:\n${body.shippingAddress}` : undefined,
    body.shipVia ? `Ship via: ${body.shipVia}` : undefined,
    '',
    'Items:',
    ...lines,
  ].filter((part) => part !== undefined).join('\n');
}

function purchaseOrderEmailHtml(purchaseOrder: any, body: any) {
  const total = (body.lines || []).reduce((sum: number, line: any) => {
    const qty = Number(line.qty || 0);
    const unitPrice = Number(line.unitPrice || 0);
    return sum + Number(line.amount || qty * unitPrice || 0);
  }, 0);
  const rows = (body.lines || []).map((line: any, idx: number) => {
    const qty = Number(line.qty || 0);
    const unitPrice = Number(line.unitPrice || 0);
    const amount = Number(line.amount || qty * unitPrice || 0);
    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${idx + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.itemName || line.partNumber || 'Item')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.description || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${qty}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${unitPrice.toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${amount.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h1 style="font-size:22px;margin:0 0 6px;">Purchase Order ${escapeHtml(purchaseOrder?.DocNumber || purchaseOrder?.Id || '')}</h1>
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
            <th style="padding:8px;text-align:left;">Description</th>
            <th style="padding:8px;text-align:right;">Qty</th>
            <th style="padding:8px;text-align:right;">Rate</th>
            <th style="padding:8px;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:18px;font-weight:700;text-align:right;margin-top:16px;">Total: $${total.toFixed(2)}</p>
    </div>
  `;
}

async function sendPurchaseOrderByConfiguredEmail(purchaseOrder: any, body: any) {
  if (!body.email) return { sent: false, sentVia: null };

  if (isSmtpConfigured()) {
    const subject = `Purchase Order ${purchaseOrder?.DocNumber || purchaseOrder?.Id || ''}`.trim();
    await sendSmtpEmail({
      to: body.email,
      cc: parseEmailList(body.ccBcc),
      subject,
      text: purchaseOrderEmailText(purchaseOrder, body),
      html: purchaseOrderEmailHtml(purchaseOrder, body),
    });
    return { sent: true, sentVia: 'smtp' };
  }

  return { sent: false, sentVia: null };
}

function purchaseOrderLineFromEstimateLine(line: any, idx: number) {
  const detail = line.SalesItemLineDetail || {};
  const itemRef = detail.ItemRef;
  const partNumber = extractPartNumber(line.Description) || itemRef?.name || '';
  const description = descriptionWithSku(cleanDescription(line.Description, partNumber) || itemRef?.name || 'Estimate line', partNumber);
  const qty = Number(detail.Qty || 1);
  const unitPrice = Number(detail.UnitPrice || line.Amount || 0);

  return {
    Id: String(idx + 1),
    Amount: Number(line.Amount || qty * unitPrice || 0),
    DetailType: 'ItemBasedExpenseLineDetail',
    Description: description,
    ItemBasedExpenseLineDetail: {
      ItemRef: itemRef?.value ? { value: itemRef.value, name: itemRef.name || partNumber || undefined } : undefined,
      Qty: qty,
      UnitPrice: unitPrice,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getQBAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const purchaseOrder = await withRefresh(auth, (client) => client.getPurchaseOrder(id));
      return NextResponse.json({ purchaseOrder });
    }

    const purchaseOrders = (await withRefresh(auth, (client) => client.getPurchaseOrders(300))) as any[];
    return NextResponse.json({ purchaseOrders, total: purchaseOrders.length });
  } catch (err) {
    console.error('Failed to get QuickBooks purchase orders:', err);
    return NextResponse.json({ error: 'Failed to get purchase orders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getQBAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

    const body = await request.json();

    if (body.action === 'send') {
      if (!body.id) return NextResponse.json({ error: 'id is required for send' }, { status: 400 });
      const sentPurchaseOrder = await withRefresh<any>(auth, (client) => client.sendPurchaseOrder(body.id, body.email));
      try { await persistPurchaseOrdersToDb(auth.orgId, [sentPurchaseOrder]); } catch (e) { console.error('persist after PO send failed', e); }
      return NextResponse.json({ success: true, purchaseOrder: sentPurchaseOrder });
    }

    if (body.action === 'from-estimate') {
      if (!body.estimateId || !body.vendorId) {
        return NextResponse.json({ error: 'estimateId and vendorId are required' }, { status: 400 });
      }

      const estimate = await withRefresh<any>(auth, (client) => client.getEstimate(body.estimateId));
      const sourceLines = (estimate.Line || []).filter((line: any) => line.DetailType === 'SalesItemLineDetail');
      const poLines = sourceLines.map(purchaseOrderLineFromEstimateLine).filter((line: any) => Number(line.Amount || 0) > 0);

      if (poLines.length === 0) {
        return NextResponse.json({ error: 'Estimate has no purchase-order lines' }, { status: 400 });
      }

      const poPayload = {
        VendorRef: { value: body.vendorId },
        DocNumber: body.poNumber || undefined,
        TxnDate: body.txnDate || new Date().toISOString().split('T')[0],
        DueDate: body.dueDate || undefined,
        Memo: body.memo || `Copied from Estimate ${estimate.DocNumber || estimate.Id}`,
        PrivateNote: privateNoteFromPurchaseOrderBody(body, `Copied from Estimate ${estimate.DocNumber || estimate.Id}`),
        POEmail: body.email ? { Address: body.email } : undefined,
        VendorAddr: addressFromText(body.mailingAddress),
        ShipAddr: addressFromText(body.shippingAddress),
        Line: poLines,
      };

      const emailBody = {
        ...body,
        lines: poLines.map((line: any) => ({
          itemName: line.ItemBasedExpenseLineDetail?.ItemRef?.name,
          description: line.Description,
          qty: line.ItemBasedExpenseLineDetail?.Qty,
          unitPrice: line.ItemBasedExpenseLineDetail?.UnitPrice,
          amount: line.Amount,
        })),
      };
      let purchaseOrder = await withRefresh<any>(auth, (client) => client.createPurchaseOrder(poPayload));
      let sentVia: string | null = null;
      if (body.send) {
        const smtpResult = await sendPurchaseOrderByConfiguredEmail(purchaseOrder, emailBody);
        if (smtpResult.sent) sentVia = smtpResult.sentVia;
        else {
          purchaseOrder = await withRefresh<any>(auth, (client) => client.sendPurchaseOrder(purchaseOrder.Id, body.email));
          sentVia = 'quickbooks';
        }
      }
      try { await persistPurchaseOrdersToDb(auth.orgId, [purchaseOrder]); } catch (e) { console.error('persist PO from estimate failed', e); }
      return NextResponse.json({ purchaseOrder, sent: Boolean(body.send), sentVia }, { status: 201 });
    }

    if (!body.vendorId || !Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ error: 'vendorId and lines[] are required' }, { status: 400 });
    }

    const poPayload = {
      VendorRef: { value: body.vendorId },
      DocNumber: body.poNumber || undefined,
      TxnDate: body.txnDate || new Date().toISOString().split('T')[0],
      DueDate: body.dueDate || undefined,
      Memo: body.memo || undefined,
      PrivateNote: privateNoteFromPurchaseOrderBody(body),
      POEmail: body.email ? { Address: body.email } : undefined,
      VendorAddr: addressFromText(body.mailingAddress),
      ShipAddr: addressFromText(body.shippingAddress),
      Line: body.lines.map((line: any, idx: number) => {
        const sku = line.partNumber || line.sku || line.itemSku || '';
        return {
          Id: String(idx + 1),
          Amount: Number(line.amount || 0),
          DetailType: 'ItemBasedExpenseLineDetail',
          Description: descriptionWithSku(line.description || line.itemName, sku),
          ItemBasedExpenseLineDetail: {
            ItemRef: line.itemId ? { value: line.itemId, name: line.itemName || sku || undefined } : undefined,
            Qty: Number(line.qty || 1),
            UnitPrice: Number(line.unitPrice || 0),
          },
        };
      }),
    };

    let purchaseOrder = await withRefresh<any>(auth, (client) => client.createPurchaseOrder(poPayload));
    let sentVia: string | null = null;
    if (body.send) {
      const smtpResult = await sendPurchaseOrderByConfiguredEmail(purchaseOrder, body);
      if (smtpResult.sent) sentVia = smtpResult.sentVia;
      else {
        purchaseOrder = await withRefresh<any>(auth, (client) => client.sendPurchaseOrder(purchaseOrder.Id, body.email));
        sentVia = 'quickbooks';
      }
    }
    try { await persistPurchaseOrdersToDb(auth.orgId, [purchaseOrder]); } catch (e) { console.error('persist created PO failed', e); }
    return NextResponse.json({ purchaseOrder, sent: Boolean(body.send), sentVia }, { status: 201 });
  } catch (err) {
    console.error('Failed to create QuickBooks purchase order:', err);
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 });
  }
}
