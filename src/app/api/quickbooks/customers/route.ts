import { NextRequest, NextResponse } from 'next/server';
import { 
  getCachedCustomers, 
  searchCustomers, 
  getCustomerById,
  syncCustomers,
  createCustomerInQuickBooks,
  getClientFromTokens 
} from '@/lib/quickbooks/sync';
import { transformCustomers, transformCustomer } from '@/lib/quickbooks/transform';
import { getOrCreateDefaultOrg } from '@/lib/org';
import type { QBCustomer } from '@/lib/quickbooks/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const id = searchParams.get('id');
    const sync = searchParams.get('sync');
    const live = searchParams.get('live');

    // If sync/live requested, pull fresh data from QuickBooks
    if (sync === 'true' || live === 'true' || query) {
      let accessToken = request.cookies.get('qb_access_token')?.value;
      let refreshToken = request.cookies.get('qb_refresh_token')?.value;
      let realmId = request.cookies.get('qb_realm_id')?.value;

      if (!accessToken || !refreshToken || !realmId) {
        const org = await getOrCreateDefaultOrg();
        if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
          accessToken = org.qbAccessToken;
          refreshToken = org.qbRefreshToken;
          realmId = org.qbRealmId;
        } else {
          return NextResponse.json(
            { error: 'Not connected to QuickBooks' },
            { status: 401 }
          );
        }
      }

      const client = getClientFromTokens(accessToken, refreshToken, realmId);
      await syncCustomers(client);
    }

    // Get specific customer by ID
    if (id) {
      const customer = getCustomerById(id);
      if (!customer) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 404 }
        );
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
    return NextResponse.json(
      { error: 'Failed to get customers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let accessToken = request.cookies.get('qb_access_token')?.value;
    let refreshToken = request.cookies.get('qb_refresh_token')?.value;
    let realmId = request.cookies.get('qb_realm_id')?.value;

    if (!accessToken || !refreshToken || !realmId) {
      const org = await getOrCreateDefaultOrg();
      if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
        accessToken = org.qbAccessToken;
        refreshToken = org.qbRefreshToken;
        realmId = org.qbRealmId;
      } else {
        return NextResponse.json(
          { error: 'Not connected to QuickBooks' },
          { status: 401 }
        );
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
      BillAddr: body.address ? {
        Line1: body.address.line1,
        City: body.address.city,
        CountrySubDivisionCode: body.address.state,
        PostalCode: body.address.zip,
      } : undefined,
      Active: body.active !== false,
    };

    const client = getClientFromTokens(accessToken, refreshToken, realmId);
    const customer = await createCustomerInQuickBooks(client, qbCustomer);

    return NextResponse.json({ success: true, customer: transformCustomer(customer) });
  } catch (err) {
    console.error('Failed to create customer:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create customer' },
      { status: 500 }
    );
  }
}
