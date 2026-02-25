import { NextRequest, NextResponse } from 'next/server';
import { createQuickBooksClient } from '@/lib/quickbooks/client';

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

    const client = createQuickBooksClient();
    
    // Generate a random state for CSRF protection
    const state = crypto.randomUUID();
    
    // Get the authorization URL
    const authUrl = client.getAuthorizationUrl(state);
    
    // In production, you'd store the state in a session/cookie to verify later
    const response = NextResponse.redirect(authUrl);
    
    // Store state in cookie for verification
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
