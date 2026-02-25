import { NextRequest, NextResponse } from 'next/server';
import { 
  getCachedItems, 
  searchItems, 
  getItemById,
  getServiceItems,
  getInventoryItems,
  syncItems,
  getClientFromTokens 
} from '@/lib/quickbooks/sync';
import { getOrCreateDefaultOrg } from '@/lib/org';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const id = searchParams.get('id');
    const type = searchParams.get('type');
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
      await syncItems(client);
    }

    // Get specific item by ID
    if (id) {
      const item = getItemById(id);
      if (!item) {
        return NextResponse.json(
          { error: 'Item not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ item });
    }

    // Get items by type
    if (type === 'service') {
      const items = getServiceItems();
      return NextResponse.json({ items, total: items.length });
    }

    if (type === 'inventory') {
      const items = getInventoryItems();
      return NextResponse.json({ items, total: items.length });
    }

    // Search items
    if (query) {
      const results = searchItems(query);
      return NextResponse.json({ items: results, total: results.length });
    }

    // Return all cached items
    const items = getCachedItems();
    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    console.error('Failed to get items:', err);
    return NextResponse.json(
      { error: 'Failed to get items' },
      { status: 500 }
    );
  }
}
