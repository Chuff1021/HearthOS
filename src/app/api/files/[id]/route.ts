import { NextResponse } from 'next/server';
import { getTenantFile, tenantFileResponse } from '@/lib/tenant/files';
import { requirePermission, tenantErrorResponse } from '@/lib/tenant/context';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await requirePermission('files:read');
    const { id } = await params;
    const file = await getTenantFile(tenant.orgId, id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    return tenantFileResponse(file);
  } catch (error) {
    const tenantResponse = tenantErrorResponse(error);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json({ error: 'Failed to load file' }, { status: 500 });
  }
}
