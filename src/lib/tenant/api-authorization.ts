import 'server-only';

import { NextResponse } from 'next/server';
import { requirePermission, tenantErrorResponse } from '@/lib/tenant/context';
import type { Permission } from '@/lib/tenant/permissions';

export async function authorizeApi(permission: Permission) {
  try {
    await requirePermission(permission);
    return null;
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: 'Authorization failed' }, { status: 500 });
  }
}
