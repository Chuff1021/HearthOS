import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { createQuickBooksClient } from '@/lib/quickbooks/client';
import { saveQuickBooksRefresh } from '@/lib/integrations/store';
import { authorizeApi } from '@/lib/tenant/api-authorization';
import {
  persistCustomersToDb,
  persistItemsToDb,
  persistVendorsToDb,
  persistInvoicesToDb,
  persistPaymentsToDb,
  persistEstimatesToDb,
  persistPurchaseOrdersToDb,
  persistBillsToDb,
} from '@/lib/quickbooks/sync';

export const maxDuration = 60;

type Entity = 'customers' | 'items' | 'vendors' | 'invoices' | 'payments' | 'estimates' | 'purchase-orders' | 'bills';

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const denied = await authorizeApi('integrations:manage');
  if (denied) return denied;
  const { entity } = await params;
  const { searchParams } = new URL(request.url);
  const allowed: Entity[] = ['customers', 'items', 'vendors', 'invoices', 'payments', 'estimates', 'purchase-orders', 'bills'];
  if (!allowed.includes(entity as Entity)) {
    return NextResponse.json({ error: `Unknown entity ${entity}` }, { status: 400 });
  }

  const cookieStore = await cookies();
  let accessToken = cookieStore.get('qb_access_token')?.value;
  let refreshToken = cookieStore.get('qb_refresh_token')?.value;
  let realmId = cookieStore.get('qb_realm_id')?.value;

  const org = await getOrCreateDefaultOrg();
  if (!accessToken || !refreshToken || !realmId) {
    if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
      accessToken = org.qbAccessToken;
      refreshToken = org.qbRefreshToken;
      realmId = org.qbRealmId;
    } else {
      return NextResponse.json({ error: 'Not connected to QuickBooks' }, { status: 401 });
    }
  }

  const client = createQuickBooksClient();
  client.setTokens({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    x_refresh_token_expires_in: 8726400,
    token_type: 'bearer',
  });
  client.setRealmId(realmId);

  const start = Date.now();
  try {
    let fetched = 0;
    let persisted = 0;
    switch (entity) {
      case 'customers': {
        const rows = await client.getAllCustomers();
        fetched = rows.length;
        persisted = await persistCustomersToDb(org.id, rows);
        break;
      }
      case 'items': {
        const rows = await client.getAllItems();
        fetched = rows.length;
        persisted = await persistItemsToDb(org.id, rows);
        break;
      }
      case 'vendors': {
        const rows = (await client.getAllVendors()) as any;
        fetched = rows.length;
        persisted = await persistVendorsToDb(org.id, rows);
        break;
      }
      case 'invoices': {
        const startPosition = searchParams.has('startPosition')
          ? boundedInt(searchParams.get('startPosition'), 1, 1, 1_000_000)
          : null;
        const pageSize = boundedInt(searchParams.get('pageSize'), 500, 1, 500);

        if (startPosition) {
          const page = await client.queryPage<any>(
            `SELECT * FROM Invoice ORDERBY TxnDate DESC STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
          );
          fetched = page.rows.length;
          persisted = await persistInvoicesToDb(org.id, page.rows);
          return NextResponse.json({
            success: true,
            entity,
            fetched,
            persisted,
            startPosition,
            pageSize,
            nextStartPosition: fetched === pageSize ? startPosition + pageSize : null,
            done: fetched < pageSize,
            ms: Date.now() - start,
          });
        }

        const rows = await client.getAllInvoices();
        fetched = rows.length;
        persisted = await persistInvoicesToDb(org.id, rows);
        break;
      }
      case 'payments': {
        const rows = await client.getAllPayments();
        fetched = rows.length;
        persisted = await persistPaymentsToDb(org.id, rows);
        break;
      }
      case 'estimates': {
        const rows = (await client.getAllEstimates()) as any;
        fetched = rows.length;
        persisted = await persistEstimatesToDb(org.id, rows);
        break;
      }
      case 'purchase-orders': {
        const rows = (await client.getAllPurchaseOrders()) as any;
        fetched = rows.length;
        persisted = await persistPurchaseOrdersToDb(org.id, rows);
        break;
      }
      case 'bills': {
        const rows = (await client.getAllBills()) as any;
        fetched = rows.length;
        persisted = await persistBillsToDb(org.id, rows);
        break;
      }
    }

    // If QB refreshed the access token mid-flight, persist the new tokens
    const newTokens = client.getTokens();
    if (newTokens && newTokens.access_token !== accessToken) {
      await saveQuickBooksRefresh({
        orgId: org.id,
        realmId: realmId!,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        expiresIn: newTokens.expires_in,
      });
    }

    return NextResponse.json({
      success: true,
      entity,
      fetched,
      persisted,
      ms: Date.now() - start,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      entity,
      error: err?.message || String(err),
      ms: Date.now() - start,
    }, { status: 500 });
  }
}
