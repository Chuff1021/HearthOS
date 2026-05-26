import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { gustoAuthorizeUrl, isGustoConfigured } from '@/lib/gusto/client';

const STATE_COOKIE = 'hearth_gusto_oauth_state';

export async function GET(request: NextRequest) {
  try {
    if (!isGustoConfigured()) {
      return NextResponse.redirect(new URL('/admin/time?gusto=not_configured', request.url));
    }

    const state = randomBytes(24).toString('hex');
    const response = NextResponse.redirect(gustoAuthorizeUrl(request, state));
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 10 * 60,
    });

    return response;
  } catch (err) {
    const url = new URL('/admin/time', request.url);
    url.searchParams.set('gusto', 'error');
    url.searchParams.set('message', err instanceof Error ? err.message : 'Failed to start Gusto connection');
    return NextResponse.redirect(url);
  }
}
