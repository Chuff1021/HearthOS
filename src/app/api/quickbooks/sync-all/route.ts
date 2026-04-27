import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { createQuickBooksClient } from '@/lib/quickbooks/client';
import { syncAllFromQuickBooks, getSyncStatus } from '@/lib/quickbooks/sync';

// Full-tenant QB sync touches thousands of records; default 60s isn't enough.
// Vercel Pro caps at 300s; Hobby caps at 60s and will silently shorten this.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // Check for tokens in cookies first
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('qb_access_token')?.value;
    let refreshToken = cookieStore.get('qb_refresh_token')?.value;
    let realmId = cookieStore.get('qb_realm_id')?.value;

    // If not in cookies, check database
    if (!accessToken || !refreshToken || !realmId) {
      const org = await getOrCreateDefaultOrg();
      if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
        accessToken = org.qbAccessToken;
        refreshToken = org.qbRefreshToken;
        realmId = org.qbRealmId;
      } else {
        return NextResponse.json(
          { error: 'Not connected to QuickBooks. Please connect first.' },
          { status: 401 }
        );
      }
    }

    // Create client and set tokens
    const client = createQuickBooksClient();
    client.setTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      x_refresh_token_expires_in: 8726400,
      token_type: 'bearer',
    });
    client.setRealmId(realmId);

    // Perform sync
    const status = await syncAllFromQuickBooks(client);

    // If tokens were refreshed, update in database
    const newTokens = client.getTokens();
    if (newTokens && newTokens.access_token !== accessToken) {
      const org = await getOrCreateDefaultOrg();
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
    }

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (err) {
    console.error('QuickBooks sync failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const status = getSyncStatus();
  return NextResponse.json({ status });
}
