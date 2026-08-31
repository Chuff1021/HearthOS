import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { db, estimateLineItems, estimates, inventoryItems } from '@/db';
import { and, asc, eq, or } from 'drizzle-orm';
import { getClientFromTokens, persistEstimatesToDb } from '@/lib/quickbooks/sync';
import { addAuditLog } from '@/lib/audit-log-store';
import { isSmtpConfigured, parseEmailList, sendSmtpEmail } from '@/lib/email/smtp';
import { renderEstimatePdf } from '@/lib/estimates/pdf';
import { saveQuickBooksRefresh } from '@/lib/integrations/store';
import { authorizeApi } from '@/lib/tenant/api-authorization';
import { createEstimateAcceptanceIntent } from '@/lib/integrations/estimate-acceptance-intents';
import { isTenantEnforcementEnabled, requireTenantContext } from '@/lib/tenant/context';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: number | undefined) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cleanDocumentNumber(value: string | undefined) {
  return value?.replace(/^QB-/i, '') || '';
}

function publicOrigin(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

async function estimateAcceptanceUrl(request: NextRequest, estimate: any, orgId: string) {
  const origin = publicOrigin(request);
  const estimateReference = String(estimate.Id || estimate.DocNumber || '');
  if (isTenantEnforcementEnabled()) {
    const tenant = await requireTenantContext();
    const intent = await createEstimateAcceptanceIntent({
      orgId,
      estimateReference,
      identityId: tenant.identityId,
    });
    return `${origin}/accept-estimate?token=${encodeURIComponent(intent.token)}`;
  }
  const params = new URLSearchParams({
    id: estimateReference,
  });
  return `${origin}/accept-estimate?${params.toString()}`;
}

function estimateAcceptanceText(acceptUrl: string) {
  return [
    'Accept estimate and service agreement:',
    acceptUrl,
    '',
    'Once the estimate is accepted, AARON\'S FIREPLACE CO, LLC will contact you to schedule the work.',
  ].join('\n');
}

function estimateAcceptanceHtml(acceptUrl: string) {
  return `
    <div style="margin-top:22px;padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
      <div style="font-weight:700;margin-bottom:8px;">Accept estimate</div>
      <p style="margin:0 0 12px;">Review and accept the estimate and service agreement online.</p>
      <p style="margin:0 0 14px;"><a href="${escapeHtml(acceptUrl)}" style="background:#16A34A;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:6px;display:inline-block;">Accept estimate</a></p>
      <p style="margin:0;color:#4b5563;">Once accepted, AARON'S FIREPLACE CO, LLC will contact you to schedule the work.</p>
    </div>
  `;
}

function estimateEmailText(estimate: any, acceptUrl: string) {
  const estimateNumber = estimate.DocNumber || estimate.Id;
  return [
    `Estimate ${estimateNumber} from AARON'S FIREPLACE CO, LLC`,
    '',
    `Total: $${money(estimate.TotalAmt)}`,
    estimate.ExpirationDate ? `Expiration date: ${estimate.ExpirationDate}` : undefined,
    '',
    'The estimate PDF is attached.',
    '',
    estimateAcceptanceText(acceptUrl),
    '',
    'Thank you,',
    "AARON'S FIREPLACE CO, LLC",
  ].filter((part) => part !== undefined).join('\n');
}

function estimateEmailHtml(estimate: any, acceptUrl: string) {
  const estimateNumber = estimate.DocNumber || estimate.Id;
  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h1 style="font-size:22px;margin:0 0 6px;">Estimate ${escapeHtml(estimateNumber)}</h1>
      <p style="margin:0 0 16px;color:#4b5563;">AARON'S FIREPLACE CO, LLC</p>
      <p style="margin:0 0 8px;">Total: <strong>$${money(estimate.TotalAmt)}</strong></p>
      ${estimate.ExpirationDate ? `<p style="margin:0 0 8px;">Expiration date: ${escapeHtml(estimate.ExpirationDate)}</p>` : ''}
      <p style="margin-top:22px;">The estimate PDF is attached.</p>
      ${estimateAcceptanceHtml(acceptUrl)}
      <p style="margin-top:22px;">Thank you,<br />AARON'S FIREPLACE CO, LLC</p>
    </div>
  `;
}

type LocalItemRef = {
  qbItemId: string | null;
  name: string;
  sku: string | null;
};

function normalizeItemLookup(value: string | undefined | null) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function localDescriptionWithProduct(description: string | null, product: string | null | undefined) {
  const text = (description || '').trim();
  const productText = (product || '').trim();
  if (!productText || normalizeItemLookup(text).includes(normalizeItemLookup(productText))) return text || productText || 'Item';
  return `${productText} - ${text}`;
}

async function localEstimateLinesForPdf(orgId: string, estimateId: string) {
  const idFilters = [eq(estimates.qbEstimateId, estimateId), eq(estimates.estimateNumber, estimateId)];
  if (isUuid(estimateId)) idFilters.push(eq(estimates.id, estimateId));

  const [localEstimate] = await db
    .select({ id: estimates.id })
    .from(estimates)
    .where(and(
      eq(estimates.orgId, orgId),
      or(...idFilters)!,
    ))
    .limit(1);

  if (!localEstimate) return [];

  const rows = await db
    .select({
      qbItemId: estimateLineItems.qbItemId,
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
      and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.qbItemId, estimateLineItems.qbItemId)),
    )
    .where(eq(estimateLineItems.estimateId, localEstimate.id))
    .orderBy(asc(estimateLineItems.order));

  return rows.map((line, idx) => {
    const product = line.itemSku || line.itemName || line.description?.split(/\r?\n/)[0] || 'Item';
    return {
      Id: String(line.order ?? idx + 1),
      Amount: Number(line.total ?? 0),
      DetailType: 'SalesItemLineDetail',
      Description: localDescriptionWithProduct(line.description, product),
      SalesItemLineDetail: {
        ItemRef: line.qbItemId ? { value: line.qbItemId, name: product } : { value: '', name: product },
        Qty: Number(line.quantity ?? 1),
        UnitPrice: Number(line.unitPrice ?? 0),
      },
    };
  });
}

function cleanLineDescription(description: string | undefined | null, partNumber: string | undefined | null) {
  let cleaned = (description || '').trim();
  const part = (partNumber || '').trim();

  if (part) {
    cleaned = cleaned
      .replace(new RegExp(`\\s*\\(${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*$`, 'i'), '')
      .replace(new RegExp(`^${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i'), '')
      .trim();
  }

  return cleaned;
}

function resolveLineItemRef(line: any, items: LocalItemRef[]) {
  const partNumber = typeof line.partNumber === 'string' ? line.partNumber.trim() : '';
  const partKey = normalizeItemLookup(partNumber);

  const exactNameMatch = partKey
    ? items.find((item) => item.qbItemId && normalizeItemLookup(item.name) === partKey)
    : undefined;
  if (exactNameMatch?.qbItemId) return { value: exactNameMatch.qbItemId, name: partNumber || exactNameMatch.name };

  const matchedById = line.itemId
    ? items.find((item) => item.qbItemId === line.itemId)
    : undefined;
  if (matchedById?.qbItemId) return { value: matchedById.qbItemId, name: partNumber || matchedById.name };

  const exactSkuMatch = partKey
    ? items.find((item) => item.qbItemId && normalizeItemLookup(item.sku) === partKey)
    : undefined;
  if (exactSkuMatch?.qbItemId) return { value: exactSkuMatch.qbItemId, name: partNumber || exactSkuMatch.name };

  const lookupKeys = [line.itemName, line.description]
    .map(normalizeItemLookup)
    .filter(Boolean);

  if (lookupKeys.length === 0) return undefined;

  const matched = items.find((item) => {
    if (!item.qbItemId) return false;
    const skuKey = normalizeItemLookup(item.sku);
    const nameKey = normalizeItemLookup(item.name);
    return lookupKeys.includes(skuKey) || lookupKeys.includes(nameKey);
  });

  return matched?.qbItemId ? { value: matched.qbItemId, name: partNumber || matched.name } : undefined;
}

function buildSalesLine(line: any, idx: number, itemRef?: { value: string; name?: string }) {
  const partNumber = typeof line.partNumber === 'string' ? line.partNumber.trim() : '';
  const cleanedDescription = cleanLineDescription(line.description, partNumber);
  const description = partNumber
    ? `${partNumber}${cleanedDescription ? ` - ${cleanedDescription}` : ''}`
    : cleanedDescription || undefined;

  if (!itemRef) {
    return {
      Id: String(idx + 1),
      Amount: Number(line.amount || 0),
      DetailType: 'DescriptionOnly',
      Description: description || 'Estimate line',
    };
  }

  return {
    Id: String(idx + 1),
    Amount: Number(line.amount || 0),
    DetailType: 'SalesItemLineDetail',
    Description: description,
    SalesItemLineDetail: {
      ItemRef: itemRef,
      Qty: Number(line.qty || 1),
      UnitPrice: Number(line.unitPrice || 0),
    },
  };
}

function quickBooksErrorMessage(err: unknown, fallback: string) {
  if (!(err instanceof Error)) return fallback;
  return err.message || fallback;
}

function isQuickBooksObjectGone(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.message.includes('"code":"610"') || err.message.includes('Object Not Found');
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function deleteLocalEstimate(orgId: string, estimateId: string) {
  const idFilters = [eq(estimates.qbEstimateId, estimateId)];
  if (isUuid(estimateId)) idFilters.push(eq(estimates.id, estimateId));

  const localRows = await db
    .select({ id: estimates.id })
    .from(estimates)
    .where(and(eq(estimates.orgId, orgId), or(...idFilters)))
    .limit(1);

  const localId = localRows[0]?.id;
  if (!localId) return false;

  await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, localId));
  await db.delete(estimates).where(eq(estimates.id, localId));
  return true;
}

async function getQBAuth(request: NextRequest) {
  let accessToken = request.cookies.get('qb_access_token')?.value;
  let refreshToken = request.cookies.get('qb_refresh_token')?.value;
  let realmId = request.cookies.get('qb_realm_id')?.value;

  try {
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
  } catch {
    return { ok: false as const, error: 'QuickBooks status unavailable' };
  }
}

async function withRefresh<T>(auth: { accessToken: string; refreshToken: string; realmId: string; orgId: string }, fn: (client: any) => Promise<T>) {
  let client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);
  try {
    return await fn(client);
  } catch {
    const tokens = await client.refreshAccessToken();
    await saveQuickBooksRefresh({
      orgId: auth.orgId,
      realmId: auth.realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

    client = getClientFromTokens(tokens.access_token, tokens.refresh_token, auth.realmId);
    return fn(client);
  }
}

export async function GET(request: NextRequest) {
  const denied = await authorizeApi('financials:read');
  if (denied) return denied;
  try {
    const auth = await getQBAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const estimates = (await withRefresh(auth, (client) => client.getEstimates(300))) as any[];
    if (id) {
      const estimate = estimates.find((entry) => entry.Id === id || entry.DocNumber === id);
      if (!estimate) {
        return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
      }
      return NextResponse.json({ estimate });
    }
    return NextResponse.json({ estimates, total: estimates.length });
  } catch (err) {
    console.error('Failed to fetch QB estimates:', err);
    return NextResponse.json({ error: 'Failed to fetch estimates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await authorizeApi('financials:write');
  if (denied) return denied;
  try {
    const auth = await getQBAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

    const body = await request.json();

    if (body.action === 'send') {
      if (!body.id) return NextResponse.json({ error: 'id is required for send' }, { status: 400 });
      if (isSmtpConfigured()) {
        const estimate = (await withRefresh(auth, (client) => client.getEstimate(body.id))) as any;
        const recipient = String(body.email || estimate.BillEmail?.Address || '').trim();
        if (!recipient) {
          return NextResponse.json({ error: 'Enter a customer email before sending this estimate.' }, { status: 400 });
        }

        const localLines = await localEstimateLinesForPdf(auth.orgId, String(body.id || estimate.Id || estimate.DocNumber || ''));
        const estimateForPdf = localLines.length ? { ...estimate, Line: localLines } : estimate;
        const estimateNumber = cleanDocumentNumber(estimate.DocNumber) || estimate.Id;
        let customer: any = null;
        if (estimate.CustomerRef?.value) {
          try {
            customer = await withRefresh(auth, (client) => client.getCustomer(estimate.CustomerRef.value));
          } catch (customerErr) {
            console.error('Failed to load estimate customer for PDF:', customerErr);
          }
        }
        const pdf = await renderEstimatePdf({ estimate: estimateForPdf, customer });
        const acceptUrl = await estimateAcceptanceUrl(request, estimate, auth.orgId);
        await sendSmtpEmail({
          to: recipient,
          cc: parseEmailList(body.ccBcc),
          bcc: body.sendMeCopy === false ? undefined : parseEmailList(process.env.SMTP_FROM || process.env.SMTP_USER),
          subject: body.emailSubject || `Estimate ${estimateNumber} from AARON'S FIREPLACE CO, LLC`,
          text: body.emailBody
            ? `${body.emailBody}\n\n${estimateAcceptanceText(acceptUrl)}`
            : estimateEmailText(estimate, acceptUrl),
          html: body.emailBody
            ? `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(body.emailBody)}</div>${estimateAcceptanceHtml(acceptUrl)}`
            : estimateEmailHtml(estimate, acceptUrl),
          attachments: [{
            filename: `Estimate ${estimateNumber}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          }],
        });

        try { await persistEstimatesToDb(auth.orgId, [estimate]); } catch (e) { console.error('persist after send failed', e); }
        await addAuditLog({
          entityType: 'estimate',
          entityId: body.id,
          action: 'update',
          actor: 'system',
          source: 'api',
          after: estimate,
          note: 'Estimate emailed from dashboard with Hearth PDF',
        });
        return NextResponse.json({ success: true, sentVia: 'smtp', estimate });
      }

      const sentEstimate = (await withRefresh(auth, (client) => client.sendEstimate(body.id, body.email))) as any;
      try { await persistEstimatesToDb(auth.orgId, [sentEstimate]); } catch (e) { console.error('persist after send failed', e); }
      await addAuditLog({
        entityType: 'estimate',
        entityId: body.id,
        action: 'update',
        actor: 'system',
        source: 'api',
        after: sentEstimate,
        note: 'Estimate emailed from dashboard',
      });
      return NextResponse.json({ success: true, estimate: sentEstimate });
    }

    if (body.action === 'update') {
      if (!body.id) return NextResponse.json({ error: 'id is required for update' }, { status: 400 });
      const updatedEstimate = (await withRefresh(auth, (client) => client.updateEstimate(body.id, body.updates || {}))) as any;
      try { await persistEstimatesToDb(auth.orgId, [updatedEstimate]); } catch (e) { console.error('persist after update failed', e); }
      await addAuditLog({
        entityType: 'estimate',
        entityId: body.id,
        action: 'update',
        actor: 'system',
        source: 'api',
        after: updatedEstimate,
        note: 'Estimate updated from dashboard',
      });
      return NextResponse.json({ success: true, estimate: updatedEstimate });
    }

    if (body.action === 'delete') {
      if (!body.id) return NextResponse.json({ error: 'id is required for delete' }, { status: 400 });
      let deletedEstimate: any = null;
      let quickBooksAlreadyGone = false;

      try {
        deletedEstimate = (await withRefresh(auth, (client) => client.deleteEstimate(body.id))) as any;
      } catch (err) {
        if (!isQuickBooksObjectGone(err)) throw err;
        quickBooksAlreadyGone = true;
      }

      const deletedLocal = await deleteLocalEstimate(auth.orgId, body.id);

      await addAuditLog({
        entityType: 'estimate',
        entityId: body.id,
        action: 'delete',
        actor: 'system',
        source: 'api',
        after: deletedEstimate,
        note: quickBooksAlreadyGone
          ? 'Estimate was already missing in QuickBooks; removed local synced copy'
          : 'Estimate deleted from dashboard',
      });

      return NextResponse.json({
        success: true,
        estimate: deletedEstimate,
        deletedLocal,
        quickBooksAlreadyGone,
      });
    }

    if (!body.customerId || !Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ error: 'customerId and lines[] are required' }, { status: 400 });
    }

    const localItems = await db
      .select({
        qbItemId: inventoryItems.qbItemId,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.orgId, auth.orgId), eq(inventoryItems.isActive, true)));

    const payload = {
      CustomerRef: { value: body.customerId },
      TxnDate: body.txnDate || new Date().toISOString().split('T')[0],
      ExpirationDate: body.expirationDate || undefined,
      PrivateNote: body.note || undefined,
      Line: body.lines.map((line: any, idx: number) => buildSalesLine(line, idx, resolveLineItemRef(line, localItems))),
    };

    const estimate = (await withRefresh(auth, (client) => client.createEstimate(payload))) as any;
    try { await persistEstimatesToDb(auth.orgId, [estimate]); } catch (e) { console.error('persist after create failed', e); }

    await addAuditLog({
      entityType: 'estimate',
      entityId: estimate.Id,
      action: 'create',
      actor: 'system',
      source: 'api',
      after: estimate,
      note: 'Created in QuickBooks via dashboard estimate flow',
    });

    return NextResponse.json({ estimate }, { status: 201 });
  } catch (err) {
    console.error('Failed to create QB estimate:', err);
    return NextResponse.json({ error: quickBooksErrorMessage(err, 'Failed to create estimate') }, { status: 500 });
  }
}
