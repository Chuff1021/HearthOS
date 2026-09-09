import { authorizeCrmApi, requireCrmActor } from "@/lib/security/crm-access";
import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedCustomers,
  searchCustomers,
  getCustomerById,
  syncCustomers,
  getClientFromTokens,
} from '@/lib/quickbooks/sync';
import { transformCustomers, transformCustomer } from '@/lib/quickbooks/transform';
import { getOrCreateDefaultOrg } from '@/lib/org';
import type { QBCustomer } from '@/lib/quickbooks/types';
import { db, organizations } from '@/db';
import { and, eq } from 'drizzle-orm';
import { CustomerCreationError, customerRequestId, executeCustomerCreation, parseCustomerInput, toQbCustomer } from '@/lib/quickbooks/customer-creation';
import { customerCreationStore } from '@/lib/quickbooks/customer-creation-store';

async function getQBAuthFromRequest(request: NextRequest) {
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
    return { ok: false as const, org, error: 'Not connected to QuickBooks' };
  }

  return {
    ok: true as const,
    org,
    accessToken,
    refreshToken,
    realmId,
  };
}

async function refreshTokensAndPersist(client: ReturnType<typeof getClientFromTokens>, orgId: string) {
  const newTokens = await client.refreshAccessToken();
  await db
    .update(organizations)
    .set({
      qbAccessToken: newTokens.access_token,
      qbRefreshToken: newTokens.refresh_token,
      qbTokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return newTokens;
}

export async function GET(request: NextRequest) {
  const accessDenied = await authorizeCrmApi("/api/quickbooks/customers", "GET");
  if (accessDenied) return accessDenied;
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const id = searchParams.get('id');
    const sync = searchParams.get('sync');
    const live = searchParams.get('live');

    // If sync/live requested, pull fresh data from QuickBooks
    if (sync === 'true' || live === 'true' || query) {
      const syncDenied = await authorizeCrmApi("/api/quickbooks/sync", "POST");
      if (syncDenied) return syncDenied;
      const auth = await getQBAuthFromRequest(request);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
      }

      const client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);

      try {
        await syncCustomers(client);
      } catch (err) {
        console.warn('Initial QB customer sync failed, trying token refresh...', err);
        try {
          const refreshed = await refreshTokensAndPersist(client, auth.org.id);
          const retriedClient = getClientFromTokens(refreshed.access_token, refreshed.refresh_token, auth.realmId);
          await syncCustomers(retriedClient);
        } catch (refreshErr) {
          console.error('QB customer sync failed after refresh:', refreshErr);
          return NextResponse.json(
            { error: 'QuickBooks connection expired. Please reconnect QuickBooks.' },
            { status: 401 }
          );
        }
      }
    }

    // Get specific customer by ID
    if (id) {
      const customer = getCustomerById(id);
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      return NextResponse.json({ customer: transformCustomer(customer) });
    }

    // Search customers
    if (query) {
      const results = searchCustomers(query);
      const transformed = results.map(transformCustomer);
      return NextResponse.json({ customers: transformed, total: transformed.length });
    }

    // Return all cached customers
    const customers = getCachedCustomers();
    const transformed = transformCustomers(customers);
    return NextResponse.json({ customers: transformed, total: transformed.length });
  } catch (err) {
    console.error('Failed to get customers:', err);
    return NextResponse.json({ error: 'Failed to get customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeCrmApi("/api/quickbooks/customers", "POST");
  if (accessDenied) return accessDenied;
  try {
    const { searchParams } = new URL(request.url);
    const sync = searchParams.get('sync');
    if (sync === 'true') {
      const auth = await getQBAuthFromRequest(request);
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
      let client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);
      try {
        const customers = await syncCustomers(client);
        return NextResponse.json({ success: true, synced: customers.length });
      } catch (err) {
        console.warn('Initial QB customer sync POST failed, trying refresh...', err);
        const refreshed = await refreshTokensAndPersist(client, auth.org.id);
        client = getClientFromTokens(refreshed.access_token, refreshed.refresh_token, auth.realmId);
        const customers = await syncCustomers(client);
        return NextResponse.json({ success: true, synced: customers.length, refreshed: true });
      }
    }

    const body = await request.json().catch(() => null);
    const input = parseCustomerInput(body);
    if (body.action !== undefined && body.action !== 'reconcile') {
      throw new CustomerCreationError('Unsupported customer action.', 'INVALID_CUSTOMER', 400);
    }
    const actor = await requireCrmActor();
    // A browser cookie or supplied organization must not select a provider account.
    const [org] = await db.select().from(organizations).where(eq(organizations.id, actor.orgId)).limit(1);
    if (!org?.qbAccessToken || !org.qbRefreshToken || !org.qbRealmId) {
      return NextResponse.json({ error: 'QuickBooks is not connected for this business.', code: 'QB_NOT_CONNECTED' }, { status: 409 });
    }
    const client = getClientFromTokens(org.qbAccessToken, org.qbRefreshToken, org.qbRealmId);
    try {
      const result = await executeCustomerCreation(input, customerCreationStore(org.id, org.qbRealmId, actor.employeeId, input), {
        create: () => client.createCustomer(toQbCustomer(input), customerRequestId(org.id, org.qbRealmId!, input)),
        find: () => client.query<QBCustomer>(`SELECT * FROM Customer WHERE DisplayName = '${input.displayName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' MAXRESULTS 10`),
      }, body.action === 'reconcile');
      return NextResponse.json({ success: true, ...result }, { status: result.recovered ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } });
    } finally {
      const tokens = client.getTokens();
      if (tokens && (tokens.access_token !== org.qbAccessToken || tokens.refresh_token !== org.qbRefreshToken)) {
        try {
          await db.update(organizations).set({ qbAccessToken: tokens.access_token, qbRefreshToken: tokens.refresh_token,
            qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), updatedAt: new Date() })
            .where(and(eq(organizations.id, org.id), eq(organizations.qbRealmId, org.qbRealmId), eq(organizations.qbRefreshToken, org.qbRefreshToken)));
        } catch { console.error('Customer token persistence needs review.'); }
      }
    }
  } catch (err) {
    console.error('Customer creation failed', { code: err instanceof CustomerCreationError ? err.code : 'CUSTOMER_CREATE_UNAVAILABLE' });
    return NextResponse.json(
      { error: err instanceof CustomerCreationError ? err.message : 'Unable to confirm customer creation. Check creation status before retrying.',
        code: err instanceof CustomerCreationError ? err.code : 'CUSTOMER_CREATE_REVIEW_REQUIRED' },
      { status: err instanceof CustomerCreationError ? err.status : 503, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
