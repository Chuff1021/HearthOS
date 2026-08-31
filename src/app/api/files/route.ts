import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, tenantErrorResponse } from '@/lib/tenant/context';
import { storeTenantFileFromDataUrl } from '@/lib/tenant/files';
import { isTenantFileStorageEnabled } from '@/lib/tenant/storage';

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export async function POST(request: NextRequest) {
  try {
    const tenant = await requirePermission('files:write');
    if (!isTenantFileStorageEnabled()) return NextResponse.json({ enabled: false });
    const body = await request.json();
    const fileName = String(body.fileName || 'upload').trim();
    const dataUrl = String(body.dataUrl || '');
    const sourceType = String(body.sourceType || 'general').trim();
    const sourceRecordId = body.sourceRecordId ? String(body.sourceRecordId) : null;
    if (!fileName || !dataUrl) {
      return NextResponse.json({ error: 'fileName and dataUrl are required' }, { status: 400 });
    }
    const file = await storeTenantFileFromDataUrl({
      orgId: tenant.orgId,
      dataUrl,
      fileName,
      sourceType,
      sourceRecordId,
      createdByIdentityId: tenant.identityId,
      allowedContentTypes: ALLOWED_TYPES,
    });
    return NextResponse.json({
      enabled: true,
      file: {
        id: String(file!.id),
        fileName: String(file!.file_name),
        contentType: String(file!.content_type),
        size: Number(file!.byte_size),
        url: `/api/files/${file!.id}`,
      },
    }, { status: 201 });
  } catch (error) {
    const tenantResponse = tenantErrorResponse(error);
    if (tenantResponse) return tenantResponse;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'File upload failed' }, { status: 400 });
  }
}
