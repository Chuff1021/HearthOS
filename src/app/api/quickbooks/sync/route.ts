import { NextRequest, NextResponse } from 'next/server';
import { syncAllFromQuickBooks, getSyncStatus, getClientFromTokens } from '@/lib/quickbooks/sync';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { authorizeApi } from '@/lib/tenant/api-authorization';

export async function POST(request: NextRequest) {
  const denied = await authorizeApi('integrations:manage');
  if (denied) return denied;
  try {
    // Get tokens from cookies
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

    // Create client with stored tokens
    const client = getClientFromTokens(accessToken, refreshToken, realmId);

    // Perform sync
    const status = await syncAllFromQuickBooks(client);

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error('QuickBooks sync error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const denied = await authorizeApi('integrations:read');
  if (denied) return denied;
  try {
    const status = getSyncStatus();
    return NextResponse.json({ status });
  } catch (err) {
    console.error('Failed to get sync status:', err);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}
