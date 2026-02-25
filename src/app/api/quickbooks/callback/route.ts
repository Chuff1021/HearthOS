import { NextRequest, NextResponse } from 'next/server';
import { createQuickBooksClient } from '@/lib/quickbooks/client';
import { db, organizations } from '@/db';
import { eq } from 'drizzle-orm';
import { getOrCreateDefaultOrg } from '@/lib/org';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const realmId = searchParams.get('realmId');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(`/integrations/quickbooks?error=${error}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !realmId) {
    return NextResponse.redirect(
      new URL('/integrations/quickbooks?error=missing_params', request.url)
    );
  }

  try {
    const client = createQuickBooksClient();
    
    // Exchange authorization code for tokens
    const tokens = await client.exchangeCodeForTokens(code);
    
    // Set realm ID
    client.setRealmId(realmId);

    // Persist tokens + realm ID to org (real backend storage)
    const org = await getOrCreateDefaultOrg();
    await db
      .update(organizations)
      .set({
        qbRealmId: realmId,
        qbAccessToken: tokens.access_token,
        qbRefreshToken: tokens.refresh_token,
        qbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        qbConnected: true,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id));

    // For now, we'll redirect with success and store in cookies (demo only)
    const response = NextResponse.redirect(
      new URL('/integrations/quickbooks?connected=true', request.url)
    );

    // Store tokens in secure HTTP-only cookies (also persisted in DB above)
    response.cookies.set('qb_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.expires_in,
    });

    response.cookies.set('qb_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.x_refresh_token_expires_in,
    });

    response.cookies.set('qb_realm_id', realmId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return response;
  } catch (err) {
    console.error('QuickBooks OAuth error:', err);
    return NextResponse.redirect(
      new URL('/integrations/quickbooks?error=oauth_failed', request.url)
    );
  }
}
