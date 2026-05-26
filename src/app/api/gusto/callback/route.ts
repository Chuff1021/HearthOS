import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, organizations } from '@/db';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { exchangeGustoCode, gustoEnvironment, tokenExpiresAt, type GustoPayrollSettings } from '@/lib/gusto/client';

const STATE_COOKIE = 'hearth_gusto_oauth_state';

type OrgSettings = Record<string, unknown> & {
  payroll?: GustoPayrollSettings;
};

function redirectBack(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/admin/time', request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const error = searchParams.get('error');
    if (error) {
      return redirectBack(request, { gusto: 'error', message: searchParams.get('error_description') || error });
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const expectedState = request.cookies.get(STATE_COOKIE)?.value;

    if (!code) return redirectBack(request, { gusto: 'error', message: 'Gusto did not return an authorization code.' });
    if (!state || !expectedState || state !== expectedState) {
      return redirectBack(request, { gusto: 'error', message: 'Gusto authorization state did not match. Please try again.' });
    }

    const token = await exchangeGustoCode(request, code);
    const org = await getOrCreateDefaultOrg();
    const currentSettings = (org.settings || {}) as OrgSettings;
    const nextSettings: OrgSettings = {
      ...currentSettings,
      payroll: {
        ...(currentSettings.payroll || {}),
        gusto: {
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          tokenType: token.token_type || 'bearer',
          scope: token.scope,
          expiresAt: tokenExpiresAt(token),
          connectedAt: new Date().toISOString(),
          environment: gustoEnvironment(),
        },
      },
    };

    await db.update(organizations).set({
      settings: nextSettings,
      updatedAt: new Date(),
    }).where(eq(organizations.id, org.id));

    return redirectBack(request, { gusto: 'connected' });
  } catch (err) {
    return redirectBack(request, { gusto: 'error', message: err instanceof Error ? err.message : 'Failed to connect Gusto' });
  }
}
