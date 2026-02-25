import { NextRequest, NextResponse } from 'next/server';
import { 
  getCachedCustomers, 
  searchCustomers, 
  getCustomerById,
  syncCustomers,
  getClientFromTokens 
} from '@/lib/quickbooks/sync';
import { getOrCreateDefaultOrg } from '@/lib/org';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const id = searchParams.get('id');
    const sync = searchParams.get('sync');

    // If sync requested, pull fresh data from QuickBooks
    if (sync === 'true') {
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
      return NextResponse.json({ customer });
    }

    // Search customers
    if (query) {
      const results = searchCustomers(query);
      return NextResponse.json({ customers: results, total: results.length });
    }

    // Return all cached customers
    const customers = getCachedCustomers();
    return NextResponse.json({ customers, total: customers.length });
  } catch (err) {
    console.error('Failed to get customers:', err);
    return NextResponse.json(
      { error: 'Failed to get customers' },
      { status: 500 }
    );
  }
}
