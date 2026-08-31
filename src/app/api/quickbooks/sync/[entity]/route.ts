import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';
import { createQuickBooksClient } from '@/lib/quickbooks/client';
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

const entityQueries: Record<Entity, string> = {
  customers: 'SELECT * FROM Customer',
  items: 'SELECT * FROM Item',
  vendors: 'SELECT * FROM Vendor',
  invoices: 'SELECT * FROM Invoice ORDERBY TxnDate DESC',
  payments: 'SELECT * FROM Payment ORDERBY TxnDate DESC',
  estimates: 'SELECT * FROM Estimate ORDERBY TxnDate DESC',
  'purchase-orders': 'SELECT * FROM PurchaseOrder ORDERBY TxnDate DESC',
  bills: 'SELECT * FROM Bill ORDERBY TxnDate DESC',
};

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const { searchParams } = new URL(request.url);
  const allowed: Entity[] = ['customers', 'items', 'vendors', 'invoices', 'payments', 'estimates', 'purchase-orders', 'bills'];
  if (!allowed.includes(entity as Entity)) {
    return NextResponse.json({ error: `Unknown entity ${entity}` }, { status: 400 });
  }

  const org = await getOrCreateDefaultOrg();
  const cookieStore = await cookies();

  // Neon is the durable source of truth. OAuth cookies can outlive an access
  // token and previously caused signed-in browsers to ignore newer DB tokens.
  const accessToken = org.qbAccessToken || cookieStore.get('qb_access_token')?.value;
  const refreshToken = org.qbRefreshToken || cookieStore.get('qb_refresh_token')?.value;
  const realmId = org.qbRealmId || cookieStore.get('qb_realm_id')?.value;

  if (!accessToken || !refreshToken || !realmId) {
    return NextResponse.json({ error: 'Not connected to QuickBooks' }, { status: 401 });
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
    const startPosition = searchParams.has('startPosition')
      ? boundedInt(searchParams.get('startPosition'), 1, 1, 1_000_000)
      : null;
    const pageSize = boundedInt(searchParams.get('pageSize'), 500, 1, 500);

    let pageRows: any[] | null = null;
    if (startPosition) {
      const page = await client.queryPage<any>(
        `${entityQueries[entity as Entity]} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
      );
      pageRows = page.rows;
    }

    switch (entity as Entity) {
      case 'customers': {
        const rows = pageRows || await client.getAllCustomers();
        fetched = rows.length;
        persisted = await persistCustomersToDb(org.id, rows);
        break;
      }
      case 'items': {
        const rows = pageRows || await client.getAllItems();
        fetched = rows.length;
        persisted = await persistItemsToDb(org.id, rows);
        break;
      }
      case 'vendors': {
        const rows = pageRows || (await client.getAllVendors()) as any;
        fetched = rows.length;
        persisted = await persistVendorsToDb(org.id, rows);
        break;
      }
      case 'invoices': {
        const rows = pageRows || await client.getAllInvoices();
        fetched = rows.length;
        persisted = await persistInvoicesToDb(org.id, rows);
        break;
      }
      case 'payments': {
        const rows = pageRows || await client.getAllPayments();
        fetched = rows.length;
        persisted = await persistPaymentsToDb(org.id, rows);
        break;
      }
      case 'estimates': {
        const rows = pageRows || (await client.getAllEstimates()) as any;
        fetched = rows.length;
        persisted = await persistEstimatesToDb(org.id, rows);
        break;
      }
      case 'purchase-orders': {
        const rows = pageRows || (await client.getAllPurchaseOrders()) as any;
        fetched = rows.length;
        persisted = await persistPurchaseOrdersToDb(org.id, rows);
        break;
      }
      case 'bills': {
        const rows = pageRows || (await client.getAllBills()) as any;
        fetched = rows.length;
        persisted = await persistBillsToDb(org.id, rows);
        break;
      }
    }

    // If QB refreshed the access token mid-flight, persist the new tokens
    const newTokens = client.getTokens();
    if (newTokens && newTokens.access_token !== accessToken) {
      await db.update(organizations).set({
        qbAccessToken: newTokens.access_token,
        qbRefreshToken: newTokens.refresh_token,
        qbTokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
        updatedAt: new Date(),
      }).where(eq(organizations.id, org.id));
    }

    return NextResponse.json({
      success: true,
      entity,
      fetched,
      persisted,
      ...(startPosition ? {
        startPosition,
        pageSize,
        nextStartPosition: fetched === pageSize ? startPosition + pageSize : null,
        done: fetched < pageSize,
      } : {}),
      ms: Date.now() - start,
    });
  } catch (err: any) {
    console.error('[quickbooks-sync] entity failed', {
      entity,
      ms: Date.now() - start,
      error: err?.message || String(err),
    });
    return NextResponse.json({
      success: false,
      entity,
      error: err?.message || String(err),
      ms: Date.now() - start,
    }, { status: 500 });
  }
}
