import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, organizations } from '@/db';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { authorizeApi } from '@/lib/tenant/api-authorization';

const PLAID_ENV = process.env.PLAID_ENV || 'production';
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;

type OrgSettings = Record<string, unknown> & {
  banking?: Record<string, unknown>;
};

function plaidBaseUrl() {
  switch (PLAID_ENV) {
    case 'sandbox':
      return 'https://sandbox.plaid.com';
    case 'development':
      return 'https://development.plaid.com';
    default:
      return 'https://production.plaid.com';
  }
}

export async function POST(request: NextRequest) {
  const denied = await authorizeApi('integrations:manage');
  if (denied) return denied;

  try {
    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      return NextResponse.json(
        { error: 'Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in Vercel.' },
        { status: 500 },
      );
    }

    const body = await request.json();
    const publicToken = body?.publicToken ? String(body.publicToken) : '';
    const metadata = body?.metadata || {};
    if (!publicToken) {
      return NextResponse.json({ error: 'publicToken is required' }, { status: 400 });
    }

    const res = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token: publicToken,
      }),
      cache: 'no-store',
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error_message || data?.display_message || data?.error_code || 'Failed to connect bank account', plaidError: data },
        { status: res.status },
      );
    }

    const org = await getOrCreateDefaultOrg();
    const currentSettings = (org.settings || {}) as OrgSettings;
    const institution = metadata?.institution
      ? {
          name: metadata.institution.name,
          institutionId: metadata.institution.institution_id,
        }
      : undefined;

    const nextSettings: OrgSettings = {
      ...currentSettings,
      banking: {
        ...(currentSettings.banking || {}),
        plaidAccessToken: data.access_token,
        plaidItemId: data.item_id,
        connectedAt: new Date().toISOString(),
        environment: PLAID_ENV,
        institution,
        accounts: Array.isArray(metadata?.accounts)
          ? metadata.accounts.map((account: any) => ({
              id: account.id,
              name: account.name,
              mask: account.mask,
              subtype: account.subtype,
              type: account.type,
            }))
          : [],
      },
    };

    await db.update(organizations).set({
      settings: nextSettings,
      updatedAt: new Date(),
    }).where(eq(organizations.id, org.id));

    return NextResponse.json({
      success: true,
      institution,
      itemId: data.item_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to connect bank account' },
      { status: 500 },
    );
  }
}
