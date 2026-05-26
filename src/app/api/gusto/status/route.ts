import { NextResponse } from 'next/server';
import { getOrCreateDefaultOrg } from '@/lib/org';
import { gustoEnvironment, isGustoConfigured, type GustoPayrollSettings } from '@/lib/gusto/client';

type OrgSettings = Record<string, unknown> & {
  payroll?: GustoPayrollSettings;
};

export async function GET() {
  try {
    const org = await getOrCreateDefaultOrg();
    const settings = (org.settings || {}) as OrgSettings;
    const gusto = settings.payroll?.gusto || {};

    return NextResponse.json({
      configured: isGustoConfigured(),
      connected: Boolean(gusto.accessToken && gusto.refreshToken),
      environment: gusto.environment || gustoEnvironment(),
      connectedAt: gusto.connectedAt || null,
      expiresAt: gusto.expiresAt || null,
    });
  } catch (err) {
    return NextResponse.json(
      { configured: isGustoConfigured(), connected: false, error: err instanceof Error ? err.message : 'Failed to load Gusto status' },
      { status: 500 },
    );
  }
}
