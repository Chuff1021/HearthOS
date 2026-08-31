import 'server-only';

import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { isTenantStorageEnabled } from '@/lib/tenant/storage';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('Private tenant files require DATABASE_URL.');
  return postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
}

function safeSegment(value: string, fallback: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 120) || fallback;
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error('The uploaded file payload is invalid.');
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_FILE_BYTES) {
    throw new Error(`Uploaded files must be between 1 byte and ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }
  return { contentType: match[1].toLowerCase(), data };
}

export async function storeTenantFileFromDataUrl(input: {
  orgId: string;
  dataUrl: string;
  fileName: string;
  sourceType: string;
  sourceRecordId?: string | null;
  createdByIdentityId?: string | null;
  allowedContentTypes?: ReadonlySet<string>;
  metadata?: Record<string, unknown>;
}) {
  if (!isTenantStorageEnabled()) return null;
  const parsed = parseDataUrl(input.dataUrl);
  if (input.allowedContentTypes && !input.allowedContentTypes.has(parsed.contentType)) {
    throw new Error('This file type is not allowed.');
  }

  const id = randomUUID();
  const objectKey = [
    input.orgId,
    safeSegment(input.sourceType, 'file'),
    safeSegment(input.sourceRecordId || id, id),
    `${id}-${safeSegment(input.fileName, 'upload')}`,
  ].join('/');
  const sql = getSql();
  try {
    const [file] = await sql`
      insert into tenant_private_files (
        id, org_id, object_key, file_name, content_type, byte_size, file_data,
        source_type, source_record_id, created_by_identity_id, metadata
      ) values (
        ${id}, ${input.orgId}, ${objectKey}, ${input.fileName}, ${parsed.contentType},
        ${parsed.data.length}, ${parsed.data}, ${input.sourceType}, ${input.sourceRecordId || null},
        ${input.createdByIdentityId || null}, ${sql.json((input.metadata || {}) as any)}
      )
      returning id, file_name, content_type, byte_size, source_type, source_record_id, created_at
    `;
    return file;
  } finally {
    await sql.end();
  }
}

export async function getTenantFile(orgId: string, id: string) {
  const sql = getSql();
  try {
    const [file] = await sql`
      select id, file_name, content_type, byte_size, file_data, source_type, source_record_id, created_at
      from tenant_private_files
      where org_id = ${orgId} and id = ${id}
      limit 1
    `;
    return file || null;
  } finally {
    await sql.end();
  }
}

export function tenantFileResponse(file: Record<string, unknown>) {
  const fileName = String(file.file_name || 'attachment').replace(/[\r\n"]/g, '');
  const contentType = String(file.content_type || 'application/octet-stream');
  const body = file.file_data as Uint8Array;
  const responseBody = Uint8Array.from(body).buffer;
  return new Response(responseBody, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(file.byte_size || body.byteLength),
      'Content-Disposition': `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
