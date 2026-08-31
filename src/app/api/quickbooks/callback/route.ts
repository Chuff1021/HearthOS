import { NextRequest, NextResponse } from 'next/server';
import { createQuickBooksClient } from '@/lib/quickbooks/client';
import { getOrCreateDefaultOrg } from '@/lib/org';
import {
  consumeOAuthState,
  isTenantIntegrationsEnabled,
  saveQuickBooksCredentials,
} from '@/lib/integrations/store';

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
  if (!code || !realmId || !state) {
    return NextResponse.redirect(
      new URL('/integrations/quickbooks?error=missing_params', request.url)
    );
  }

  try {
    const cookieState = request.cookies.get('qb_oauth_state')?.value;
    if (!cookieState || cookieState !== state) {
      return NextResponse.redirect(new URL('/integrations/quickbooks?error=invalid_state', request.url));
    }

    const oauthState = isTenantIntegrationsEnabled()
      ? await consumeOAuthState('quickbooks', state)
      : null;
    if (isTenantIntegrationsEnabled() && !oauthState) {
      return NextResponse.redirect(new URL('/integrations/quickbooks?error=expired_state', request.url));
    }

    const client = createQuickBooksClient();
    
    // Exchange authorization code for tokens
    const tokens = await client.exchangeCodeForTokens(code);
    
    // Set realm ID
    client.setRealmId(realmId);

    // Persist tokens + realm ID to org (real backend storage)
    const org = oauthState
      ? { id: oauthState.orgId }
      : await getOrCreateDefaultOrg();
    await saveQuickBooksCredentials({
      orgId: org.id,
      realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      connectedByIdentityId: oauthState?.identityId || null,
    });

    // For now, we'll redirect with success and store in cookies (demo only)
    const response = NextResponse.redirect(
      new URL('/integrations/quickbooks?connected=true', request.url)
    );

    response.cookies.delete('qb_oauth_state');
    if (!isTenantIntegrationsEnabled()) response.cookies.set('qb_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.expires_in,
    });

    if (!isTenantIntegrationsEnabled()) response.cookies.set('qb_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.x_refresh_token_expires_in,
    });

    if (!isTenantIntegrationsEnabled()) response.cookies.set('qb_realm_id', realmId, {
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
