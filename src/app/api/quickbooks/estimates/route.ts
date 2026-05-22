import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { db, estimateLineItems, estimates, inventoryItems, organizations } from '@/db';
import { and, eq } from 'drizzle-orm';
import { getClientFromTokens, persistEstimatesToDb } from '@/lib/quickbooks/sync';
import { addAuditLog } from '@/lib/audit-log-store';

type LocalItemRef = {
  qbItemId: string | null;
  name: string;
  sku: string | null;
};

function normalizeItemLookup(value: string | undefined | null) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveLineItemRef(line: any, items: LocalItemRef[]) {
  if (line.itemId) {
    const matched = items.find((item) => item.qbItemId === line.itemId);
    if (matched?.qbItemId) return { value: matched.qbItemId, name: matched.name };
  }

  const lookupKeys = [line.partNumber, line.itemName, line.description]
    .map(normalizeItemLookup)
    .filter(Boolean);

  if (lookupKeys.length === 0) return undefined;

  const matched = items.find((item) => {
    if (!item.qbItemId) return false;
    const skuKey = normalizeItemLookup(item.sku);
    const nameKey = normalizeItemLookup(item.name);
    return lookupKeys.includes(skuKey) || lookupKeys.includes(nameKey);
  });

  return matched?.qbItemId ? { value: matched.qbItemId, name: matched.name } : undefined;
}

function buildSalesLine(line: any, idx: number, itemRef?: { value: string; name?: string }) {
  const description = line.partNumber
    ? `${line.description || ''}\nPart: ${line.partNumber}`.trim()
    : line.description || undefined;

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

export async function GET(request: NextRequest) {
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
  try {
    const auth = await getQBAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

    const body = await request.json();

    if (body.action === 'send') {
      if (!body.id) return NextResponse.json({ error: 'id is required for send' }, { status: 400 });
      const sentEstimate = (await withRefresh(auth, (client) => client.sendEstimate(body.id, body.email))) as any;
      try { await persistEstimatesToDb(auth.orgId, [sentEstimate]); } catch (e) { console.error('persist after send failed', e); }
      addAuditLog({
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
      addAuditLog({
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
      const deletedEstimate = (await withRefresh(auth, (client) => client.deleteEstimate(body.id))) as any;

      const localRows = await db
        .select({ id: estimates.id })
        .from(estimates)
        .where(and(eq(estimates.orgId, auth.orgId), eq(estimates.qbEstimateId, body.id)))
        .limit(1);
      const localId = localRows[0]?.id;
      if (localId) {
        await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, localId));
        await db.delete(estimates).where(eq(estimates.id, localId));
      }

      addAuditLog({
        entityType: 'estimate',
        entityId: body.id,
        action: 'delete',
        actor: 'system',
        source: 'api',
        after: deletedEstimate,
        note: 'Estimate deleted from dashboard',
      });

      return NextResponse.json({ success: true, estimate: deletedEstimate });
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

    addAuditLog({
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
