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
    const cookieStore = await cookies();
    const org = await getOrCreateDefaultOrg();

    // Prefer durable DB credentials. Cookies may be stale after a token refresh.
    const accessToken = org.qbAccessToken || cookieStore.get('qb_access_token')?.value;
    const refreshToken = org.qbRefreshToken || cookieStore.get('qb_refresh_token')?.value;
    const realmId = org.qbRealmId || cookieStore.get('qb_realm_id')?.value;

    if (!accessToken || !refreshToken || !realmId) {
      return NextResponse.json(
        { error: 'Not connected to QuickBooks. Please connect first.' },
        { status: 401 }
      );
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
