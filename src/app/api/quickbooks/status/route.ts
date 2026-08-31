import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { createQuickBooksClient } from '@/lib/quickbooks/client';
import { saveQuickBooksRefresh } from '@/lib/integrations/store';
import { authorizeApi } from '@/lib/tenant/api-authorization';

export async function GET() {
  const denied = await authorizeApi('integrations:read');
  if (denied) return denied;
  try {
    // Check for tokens in cookies first
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('qb_access_token')?.value;
    let refreshToken = cookieStore.get('qb_refresh_token')?.value;
    let realmId = cookieStore.get('qb_realm_id')?.value;

    // If not in cookies, check database
    if (!accessToken || !refreshToken || !realmId) {
      try {
        const org = await getOrCreateDefaultOrg();
        if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
          accessToken = org.qbAccessToken;
          refreshToken = org.qbRefreshToken;
          realmId = org.qbRealmId;
        } else {
          return NextResponse.json({
            connected: false,
            error: 'Not connected to QuickBooks',
          });
        }
      } catch {
        return NextResponse.json({
          connected: false,
          error: 'QuickBooks status unavailable',
        });
      }
    }

    // Try to make a real API call to verify the connection
    const client = createQuickBooksClient();
    client.setTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      x_refresh_token_expires_in: 8726400,
      token_type: 'bearer',
    });
    client.setRealmId(realmId);

    // Try to get company info to verify connection
    try {
      const companyInfo = await client.getCompanyInfo();
      return NextResponse.json({
        connected: true,
        companyName: companyInfo.CompanyName,
        realmId: realmId,
      });
    } catch (apiError) {
      // Token might be expired, try to refresh
      console.log('Token expired, attempting refresh...');
      
      try {
        const newTokens = await client.refreshAccessToken();
        
        // Update tokens in database
        const org = await getOrCreateDefaultOrg();
        await saveQuickBooksRefresh({
          orgId: org.id,
          realmId: realmId!,
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresIn: newTokens.expires_in,
        });

        // Try company info again
        const companyInfo = await client.getCompanyInfo();
        return NextResponse.json({
          connected: true,
          companyName: companyInfo.CompanyName,
          realmId: realmId,
          refreshed: true,
        });
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return NextResponse.json({
          connected: false,
          error: 'QuickBooks connection expired. Please reconnect.',
          needsReconnect: true,
        });
      }
    }
  } catch (err) {
    console.error('QuickBooks status check failed:', err);
    return NextResponse.json({
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
