import { NextRequest, NextResponse } from 'next/server';
import { createQuickBooksClient } from '@/lib/quickbooks/client';

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

    // In a real app, you would:
    // 1. Store tokens and realmId in the database associated with the user/org
    // 2. Set up a secure session or JWT
    // 3. Schedule token refresh before expiration

    // For now, we'll redirect with success and store in cookies (demo only)
    const response = NextResponse.redirect(
      new URL('/integrations/quickbooks?connected=true', request.url)
    );

    // Store tokens in secure HTTP-only cookies (in production, use database)
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
