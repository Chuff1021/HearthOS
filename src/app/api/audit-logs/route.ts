import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/audit-log-store';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType') as any;
  const entityId = searchParams.get('entityId') || undefined;
  const limit = Number(searchParams.get('limit') || 200);

  const logs = getAuditLogs({ entityType, entityId, limit });
  return NextResponse.json({ logs, total: logs.length });
}
