import { NextRequest } from 'next/server';

export type GustoTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type GustoPayrollSettings = {
  gusto?: {
    accessToken?: string;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
    expiresAt?: string;
    connectedAt?: string;
    environment?: string;
  };
};

const GUSTO_ENV = process.env.GUSTO_ENV || 'production';
const GUSTO_CLIENT_ID = process.env.GUSTO_CLIENT_ID;
const GUSTO_CLIENT_SECRET = process.env.GUSTO_CLIENT_SECRET;
const GUSTO_REDIRECT_URI = process.env.GUSTO_REDIRECT_URI;
const GUSTO_SCOPES = process.env.GUSTO_SCOPES;

export function gustoEnvironment() {
  return GUSTO_ENV;
}

export function isGustoConfigured() {
  return Boolean(GUSTO_CLIENT_ID && GUSTO_CLIENT_SECRET);
}

export function gustoBaseUrl() {
  if (process.env.GUSTO_API_BASE_URL) return process.env.GUSTO_API_BASE_URL.replace(/\/$/, '');
  return GUSTO_ENV === 'demo' || GUSTO_ENV === 'sandbox'
    ? 'https://api.gusto-demo.com'
    : 'https://api.gusto.com';
}

export function gustoRedirectUri(request: NextRequest) {
  return GUSTO_REDIRECT_URI || new URL('/api/gusto/callback', request.url).toString();
}

export function gustoAuthorizeUrl(request: NextRequest, state: string) {
  if (!GUSTO_CLIENT_ID) throw new Error('Gusto is not configured. Set GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET in Vercel.');

  const url = new URL('/oauth/authorize', gustoBaseUrl());
  url.searchParams.set('client_id', GUSTO_CLIENT_ID);
  url.searchParams.set('redirect_uri', gustoRedirectUri(request));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  if (GUSTO_SCOPES) url.searchParams.set('scope', GUSTO_SCOPES);
  return url;
}

export async function exchangeGustoCode(request: NextRequest, code: string): Promise<GustoTokenResponse> {
  if (!GUSTO_CLIENT_ID || !GUSTO_CLIENT_SECRET) {
    throw new Error('Gusto is not configured. Set GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET in Vercel.');
  }

  const res = await fetch(`${gustoBaseUrl()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: GUSTO_CLIENT_ID,
      client_secret: GUSTO_CLIENT_SECRET,
      redirect_uri: gustoRedirectUri(request),
      code,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error_description || data?.error || data?.message || 'Failed to connect Gusto';
    throw new Error(message);
  }

  if (!data?.access_token || !data?.refresh_token) {
    throw new Error('Gusto did not return an access token and refresh token.');
  }

  return data as GustoTokenResponse;
}

export function tokenExpiresAt(token: GustoTokenResponse) {
  const expiresInSeconds = Number(token.expires_in || 7200);
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}
