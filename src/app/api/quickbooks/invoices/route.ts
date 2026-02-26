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
import { transformInvoices, transformInvoice } from '@/lib/quickbooks/transform';
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
      const transformed = transformInvoices(invoices);
      const total = getTotalOutstanding();
      return NextResponse.json({ invoices: transformed, totalOutstanding: total });
    }

    // Get invoices for specific customer
    if (customerId) {
      const invoices = getInvoicesForCustomer(customerId);
      const transformed = transformInvoices(invoices);
      return NextResponse.json({ invoices: transformed, total: transformed.length });
    }

    // Return all cached invoices
    const invoices = getCachedInvoices();
    const transformed = transformInvoices(invoices);
    return NextResponse.json({ invoices: transformed, total: transformed.length });
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

    const body = await request.json();
    
    // Check if this is UI format (has lineItems) or QB format
    const isUIFormat = 'lineItems' in body && Array.isArray((body as any).lineItems);
    
    let qbInvoice: Partial<QBInvoice>;
    
    if (isUIFormat) {
      // Transform UI format to QB format
      const uiLineItems = (body.lineItems as Array<{description: string; qty: number; unitPrice: number; total: number}>);
      qbInvoice = {
        CustomerRef: {
          value: (body as any).customerId || '',
          name: (body as any).customerName || '',
        },
        TxnDate: (body as any).issueDate || new Date().toISOString().split('T')[0],
        DueDate: (body as any).dueDate,
        Line: uiLineItems.map((li, idx) => ({
          LineNum: idx + 1,
          Amount: li.total,
          DetailType: 'SalesItemLineDetail' as const,
          Description: li.description,
          SalesItemLineDetail: {
            ItemRef: {
              value: '',
              name: li.description,
            },
            UnitPrice: li.unitPrice,
            Qty: li.qty,
          },
        })),
        PrivateNote: (body as any).notes,
      };
    } else {
      qbInvoice = body as Partial<QBInvoice>;
    }
    
    // Validate required fields
    if (!qbInvoice.CustomerRef?.value) {
      return NextResponse.json(
        { error: 'CustomerRef is required' },
        { status: 400 }
      );
    }

    if (!qbInvoice.Line || qbInvoice.Line.length === 0) {
      return NextResponse.json(
        { error: 'At least one line item is required' },
        { status: 400 }
      );
    }

    const client = getClientFromTokens(accessToken, refreshToken, realmId);
    const invoice = await createInvoiceInQuickBooks(client, qbInvoice);

    return NextResponse.json({ success: true, invoice: transformInvoice(invoice) });
  } catch (err) {
    console.error('Failed to create invoice:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
