import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/audit-log-store';
import { requirePermission, tenantErrorResponse } from '@/lib/tenant/context';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('reports:read');
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') as any;
    const entityId = searchParams.get('entityId') || undefined;
    const limit = Number(searchParams.get('limit') || 200);

    const logs = await getAuditLogs({ entityType, entityId, limit });
    return NextResponse.json({ logs, total: logs.length });
  } catch (error) {
    return tenantErrorResponse(error) || NextResponse.json({ error: 'Failed to load audit logs' }, { status: 500 });
  }
}
