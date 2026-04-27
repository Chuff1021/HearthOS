import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { db, organizations, vendors } from '@/db';
import { and, eq, ilike, or } from 'drizzle-orm';
import { getClientFromTokens, syncVendors } from '@/lib/quickbooks/sync';

async function getQBAuth(request: NextRequest, orgId: string) {
  let accessToken = request.cookies.get('qb_access_token')?.value;
  let refreshToken = request.cookies.get('qb_refresh_token')?.value;
  let realmId = request.cookies.get('qb_realm_id')?.value;

  if (!accessToken || !refreshToken || !realmId) {
    const org = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const orgRow = org[0];
    if (orgRow?.qbAccessToken && orgRow?.qbRefreshToken && orgRow?.qbRealmId) {
      accessToken = orgRow.qbAccessToken;
      refreshToken = orgRow.qbRefreshToken;
      realmId = orgRow.qbRealmId;
    }
  }

  if (!accessToken || !refreshToken || !realmId) {
    return { ok: false as const, error: 'Not connected to QuickBooks' };
  }

  return { ok: true as const, accessToken, refreshToken, realmId };
}

function shapeVendor(v: typeof vendors.$inferSelect) {
  return {
    Id: v.qbVendorId || v.id,
    LocalId: v.id,
    DisplayName: v.displayName,
    CompanyName: v.companyName || undefined,
    GivenName: v.firstName || undefined,
    FamilyName: v.lastName || undefined,
    PrimaryEmailAddr: v.email ? { Address: v.email } : undefined,
    PrimaryPhone: v.phone ? { FreeFormNumber: v.phone } : undefined,
    AlternatePhone: v.phoneAlt ? { FreeFormNumber: v.phoneAlt } : undefined,
    WebAddr: v.website ? { URI: v.website } : undefined,
    BillAddr: v.addressLine1 || v.city || v.state || v.zip
      ? {
          Line1: v.addressLine1 || undefined,
          Line2: v.addressLine2 || undefined,
          City: v.city || undefined,
          CountrySubDivisionCode: v.state || undefined,
          PostalCode: v.zip || undefined,
        }
      : undefined,
    AcctNum: v.accountNumber || undefined,
    TaxIdentifier: v.taxId || undefined,
    Vendor1099: v.is1099 || false,
    PaymentTerms: v.paymentTerms || undefined,
    Balance: Number(v.balance || 0),
    Active: v.isActive !== false,
    LastSyncedAt: v.lastSyncedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const live = searchParams.get('live') === 'true';
    const sync = searchParams.get('sync') === 'true';

    const org = await getOrCreateDefaultOrg();

    // ?sync=true → pull fresh from QB and persist, then return
    if (sync) {
      const auth = await getQBAuth(request, org.id);
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

      let client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);
      try {
        await syncVendors(client, org.id);
      } catch {
        const tokens = await client.refreshAccessToken();
        await db.update(organizations).set({
          qbAccessToken: tokens.access_token,
          qbRefreshToken: tokens.refresh_token,
          qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          updatedAt: new Date(),
        }).where(eq(organizations.id, org.id));
        client = getClientFromTokens(tokens.access_token, tokens.refresh_token, auth.realmId);
        await syncVendors(client, org.id);
      }
    }

    // ?live=true → bypass DB, query QB directly (legacy behavior)
    if (live) {
      const auth = await getQBAuth(request, org.id);
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

      let client = getClientFromTokens(auth.accessToken, auth.refreshToken, auth.realmId);
      let liveVendors: any[] = [];
      try {
        liveVendors = await client.getVendors(1000);
      } catch {
        const tokens = await client.refreshAccessToken();
        await db.update(organizations).set({
          qbAccessToken: tokens.access_token,
          qbRefreshToken: tokens.refresh_token,
          qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          updatedAt: new Date(),
        }).where(eq(organizations.id, org.id));
        client = getClientFromTokens(tokens.access_token, tokens.refresh_token, auth.realmId);
        liveVendors = await client.getVendors(1000);
      }
      const filtered = q
        ? liveVendors.filter((v) =>
            v.DisplayName?.toLowerCase().includes(q.toLowerCase()) ||
            v.CompanyName?.toLowerCase().includes(q.toLowerCase()) ||
            v.PrimaryEmailAddr?.Address?.toLowerCase().includes(q.toLowerCase())
          )
        : liveVendors;
      return NextResponse.json({ vendors: filtered, total: filtered.length, source: 'quickbooks' });
    }

    // Default: read from local DB
    const where = q
      ? and(
          eq(vendors.orgId, org.id),
          or(
            ilike(vendors.displayName, `%${q}%`),
            ilike(vendors.companyName, `%${q}%`),
            ilike(vendors.email, `%${q}%`),
          )
        )
      : eq(vendors.orgId, org.id);

    const rows = await db.select().from(vendors).where(where);
    const shaped = rows.map(shapeVendor);
    return NextResponse.json({ vendors: shaped, total: shaped.length, source: 'local' });
  } catch (err) {
    console.error('Failed to get vendors:', err);
    return NextResponse.json({ error: 'Failed to get vendors' }, { status: 500 });
  }
}
