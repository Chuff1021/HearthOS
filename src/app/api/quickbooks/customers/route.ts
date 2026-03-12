import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedCustomers,
  searchCustomers,
  getCustomerById,
  syncCustomers,
  createCustomerInQuickBooks,
  getClientFromTokens,
} from '@/lib/quickbooks/sync';
import { transformCustomers, transformCustomer } from '@/lib/quickbooks/transform';
import { getOrCreateDefaultOrg } from '@/lib/org';
import type { QBCustomer } from '@/lib/quickbooks/types';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';

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
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const id = searchParams.get('id');
    const sync = searchParams.get('sync');
    const live = searchParams.get('live');

    // If sync/live requested, pull fresh data from QuickBooks
    if (sync === 'true' || live === 'true' || query) {
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
  try {
    const { searchParams } = new URL(request.url);
    const sync = searchParams.get('sync');
    const auth = await getQBAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    let client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);

    if (sync === 'true') {
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

    const body = await request.json();

    // Transform UI customer to QB format
    const qbCustomer: Partial<QBCustomer> = {
      DisplayName: body.displayName || `${body.firstName} ${body.lastName}`.trim(),
      GivenName: body.firstName,
      FamilyName: body.lastName,
      CompanyName: body.companyName,
      PrimaryEmailAddr: body.email ? { Address: body.email } : undefined,
      PrimaryPhone: body.phone ? { FreeFormNumber: body.phone } : undefined,
      BillAddr: body.address
        ? {
            Line1: body.address.line1,
            City: body.address.city,
            CountrySubDivisionCode: body.address.state,
            PostalCode: body.address.zip,
          }
        : undefined,
      Active: body.active !== false,
    };

    try {
      const customer = await createCustomerInQuickBooks(client, qbCustomer);
      return NextResponse.json({ success: true, customer: transformCustomer(customer) });
    } catch (err) {
      console.warn('Initial QB create customer failed, trying refresh...', err);
      const refreshed = await refreshTokensAndPersist(client, auth.org.id);
      client = getClientFromTokens(refreshed.access_token, refreshed.refresh_token, auth.realmId);
      const customer = await createCustomerInQuickBooks(client, qbCustomer);
      return NextResponse.json({ success: true, customer: transformCustomer(customer), refreshed: true });
    }
  } catch (err) {
    console.error('Failed to create customer:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create customer' },
      { status: 500 }
    );
  }
}
