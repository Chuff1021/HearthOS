import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';
import { getClientFromTokens } from '@/lib/quickbooks/sync';

async function getQBAuth(request: NextRequest) {
  let accessToken = request.cookies.get('qb_access_token')?.value;
  let refreshToken = request.cookies.get('qb_refresh_token')?.value;
  let realmId = request.cookies.get('qb_realm_id')?.value;

  const org = await getOrCreateDefaultOrg();
  if (!accessToken || !refreshToken || !realmId) {
    if (org.qbAccessToken && org.qbRefreshToken && org.qbRealmId) {
      accessToken = org.qbAccessToken;
      refreshToken = org.qbRefreshToken;
      realmId = org.qbRealmId;
    }
  }

  if (!accessToken || !refreshToken || !realmId) {
    return { ok: false as const, error: 'Not connected to QuickBooks' };
  }

  return { ok: true as const, accessToken, refreshToken, realmId, orgId: org.id };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').toLowerCase();

    const auth = await getQBAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

    let client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);
    let vendors: any[] = [];

    try {
      vendors = await client.getVendors(1000);
    } catch {
      const tokens = await client.refreshAccessToken();
      await db.update(organizations).set({
        qbAccessToken: tokens.access_token,
        qbRefreshToken: tokens.refresh_token,
        qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date(),
      }).where(eq(organizations.id, auth.orgId));
      client = getClientFromTokens(tokens.access_token, tokens.refresh_token, auth.realmId);
      vendors = await client.getVendors(1000);
    }

    if (q) {
      vendors = vendors.filter((v) =>
        v.DisplayName?.toLowerCase().includes(q) ||
        v.CompanyName?.toLowerCase().includes(q) ||
        v.PrimaryEmailAddr?.Address?.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ vendors, total: vendors.length });
  } catch (err) {
    console.error('Failed to get QuickBooks vendors:', err);
    return NextResponse.json({ error: 'Failed to get vendors' }, { status: 500 });
  }
}
