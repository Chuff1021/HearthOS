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

export async function POST(_request: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
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
