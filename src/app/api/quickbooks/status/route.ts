import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { createQuickBooksClient } from '@/lib/quickbooks/client';

export async function GET() {
  try {
    // Neon is the durable source of truth. Browser OAuth cookies may contain
    // an older token pair after a server-side refresh.
    const cookieStore = await cookies();
    const org = await getOrCreateDefaultOrg();
    const accessToken = org.qbAccessToken || cookieStore.get('qb_access_token')?.value;
    const refreshToken = org.qbRefreshToken || cookieStore.get('qb_refresh_token')?.value;
    const realmId = org.qbRealmId || cookieStore.get('qb_realm_id')?.value;

    if (!accessToken || !refreshToken || !realmId) {
      return NextResponse.json({
        connected: false,
        error: 'Not connected to QuickBooks',
      });
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
      const currentTokens = client.getTokens();
      if (currentTokens && currentTokens.access_token !== accessToken) {
        const { db, organizations } = await import('@/db');
        const { eq } = await import('drizzle-orm');
        await db
          .update(organizations)
          .set({
            qbAccessToken: currentTokens.access_token,
            qbRefreshToken: currentTokens.refresh_token,
            qbTokenExpiresAt: new Date(Date.now() + currentTokens.expires_in * 1000),
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, org.id));
      }
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
        const { db, organizations } = await import('@/db');
        const { eq } = await import('drizzle-orm');
        
        await db
          .update(organizations)
          .set({
            qbAccessToken: newTokens.access_token,
            qbRefreshToken: newTokens.refresh_token,
            qbTokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, org.id));

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
