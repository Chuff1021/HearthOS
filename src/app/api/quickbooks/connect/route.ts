import { NextRequest, NextResponse } from 'next/server';
import { createQuickBooksClient } from '@/lib/quickbooks/client';
import { requirePermission } from '@/lib/tenant/context';
import { createOAuthState, isTenantIntegrationsEnabled } from '@/lib/integrations/store';

export async function GET(request: NextRequest) {
  try {
    if (
      !process.env.QUICKBOOKS_CLIENT_ID ||
      !process.env.QUICKBOOKS_CLIENT_SECRET ||
      !process.env.QUICKBOOKS_REDIRECT_URI
    ) {
      return NextResponse.json(
        { error: 'QuickBooks not configured. Set QUICKBOOKS_CLIENT_ID/SECRET/REDIRECT_URI.' },
        { status: 500 }
      );
    }

    const context = await requirePermission('integrations:manage');
    const client = createQuickBooksClient();
    if (isTenantIntegrationsEnabled() && !context.identityId) {
      return NextResponse.json(
        { error: 'Tenant integration storage requires an organization membership.' },
        { status: 409 },
      );
    }
    const state = isTenantIntegrationsEnabled()
      ? await createOAuthState({
          provider: 'quickbooks',
          orgId: context.orgId,
          identityId: context.identityId as string,
          redirectPath: '/integrations/quickbooks',
        })
      : crypto.randomUUID();
    
    // Get the authorization URL
    const authUrl = client.getAuthorizationUrl(state);
    
    const response = NextResponse.redirect(authUrl);

    response.cookies.set('qb_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
    });

    return response;
  } catch (err) {
    console.error('QuickBooks connect error:', err);
    return NextResponse.json(
      { error: 'Failed to initiate QuickBooks connection' },
      { status: 500 }
    );
  }
}
