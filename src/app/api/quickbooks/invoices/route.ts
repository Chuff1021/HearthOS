import { NextRequest, NextResponse } from 'next/server';
import { 
  getCachedInvoices, 
  getInvoicesForCustomer,
  getOutstandingInvoices,
  getTotalOutstanding,
  syncInvoices,
  createInvoiceInQuickBooks,
  getClientFromTokens 
} from '@/lib/quickbooks/sync';
import { getOrCreateDefaultOrg } from '@/lib/org';
import type { QBInvoice } from '@/lib/quickbooks/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const outstanding = searchParams.get('outstanding');
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
      await syncInvoices(client);
    }

    // Get outstanding invoices
    if (outstanding === 'true') {
      const invoices = getOutstandingInvoices();
      const total = getTotalOutstanding();
      return NextResponse.json({ invoices, totalOutstanding: total });
    }

    // Get invoices for specific customer
    if (customerId) {
      const invoices = getInvoicesForCustomer(customerId);
      return NextResponse.json({ invoices, total: invoices.length });
    }

    // Return all cached invoices
    const invoices = getCachedInvoices();
    return NextResponse.json({ invoices, total: invoices.length });
  } catch (err) {
    console.error('Failed to get invoices:', err);
    return NextResponse.json(
      { error: 'Failed to get invoices' },
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

    const body = await request.json() as Partial<QBInvoice>;
    
    // Validate required fields
    if (!body.CustomerRef?.value) {
      return NextResponse.json(
        { error: 'CustomerRef is required' },
        { status: 400 }
      );
    }

    if (!body.Line || body.Line.length === 0) {
      return NextResponse.json(
        { error: 'At least one line item is required' },
        { status: 400 }
      );
    }

    const client = getClientFromTokens(accessToken, refreshToken, realmId);
    const invoice = await createInvoiceInQuickBooks(client, body);

    return NextResponse.json({ success: true, invoice });
  } catch (err) {
    console.error('Failed to create invoice:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
