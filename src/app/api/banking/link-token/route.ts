import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { authorizeApi } from '@/lib/tenant/api-authorization';

const PLAID_ENV = process.env.PLAID_ENV || 'production';
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_REDIRECT_URI = process.env.PLAID_REDIRECT_URI;

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

    const org = await getOrCreateDefaultOrg();
    const payload: Record<string, unknown> = {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      client_name: "AARON'S FIREPLACE CO, LLC",
      language: 'en',
      country_codes: ['US'],
      products: ['transactions'],
      user: {
        client_user_id: org.id,
      },
    };

    if (PLAID_REDIRECT_URI) payload.redirect_uri = PLAID_REDIRECT_URI;

    const res = await fetch(`${plaidBaseUrl()}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error_message || data?.display_message || data?.error_code || 'Failed to create Plaid link token', plaidError: data },
        { status: res.status },
      );
    }

    return NextResponse.json({ linkToken: data.link_token, expiration: data.expiration });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create Plaid link token' },
      { status: 500 },
    );
  }
}
