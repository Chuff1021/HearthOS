import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';
import { getClientFromTokens, persistEstimatesToDb } from '@/lib/quickbooks/sync';
import { addAuditLog } from '@/lib/audit-log-store';

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

    if (!body.customerId || !Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ error: 'customerId and lines[] are required' }, { status: 400 });
    }

    const payload = {
      CustomerRef: { value: body.customerId },
      TxnDate: body.txnDate || new Date().toISOString().split('T')[0],
      ExpirationDate: body.expirationDate || undefined,
      PrivateNote: body.note || undefined,
      Line: body.lines.map((line: any, idx: number) => ({
        Id: String(idx + 1),
        Amount: Number(line.amount || 0),
        DetailType: 'SalesItemLineDetail',
        Description: line.partNumber ? `${line.description || ''}\nPart: ${line.partNumber}`.trim() : line.description || undefined,
        SalesItemLineDetail: {
          ItemRef: line.itemId ? { value: line.itemId } : undefined,
          Qty: Number(line.qty || 1),
          UnitPrice: Number(line.unitPrice || 0),
        },
      })),
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
    return NextResponse.json({ error: 'Failed to create estimate' }, { status: 500 });
  }
}
