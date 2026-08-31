import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import postgres from 'postgres';
import { isTenantStorageEnabled } from '@/lib/tenant/storage';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('Private tenant files require DATABASE_URL.');
  return postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
}

function getObjectStorage() {
  const endpoint = process.env.HEARTHOS_OBJECT_STORAGE_ENDPOINT;
  const bucket = process.env.HEARTHOS_OBJECT_STORAGE_BUCKET;
  const accessKeyId = process.env.HEARTHOS_OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.HEARTHOS_OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Private object storage is not configured.');
  }
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: process.env.HEARTHOS_OBJECT_STORAGE_REGION || 'auto',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
    }),
  };
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
  const checksum = createHash('sha256').update(parsed.data).digest('hex');
  const storage = getObjectStorage();
  const uploaded = await storage.client.send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: objectKey,
    Body: parsed.data,
    ContentType: parsed.contentType,
    Metadata: {
      organization: input.orgId,
      checksum,
    },
  }));
  const sql = getSql();
  try {
    const [file] = await sql`
      insert into tenant_private_files (
        id, org_id, object_key, file_name, content_type, byte_size, file_data,
        storage_provider, checksum_sha256, etag, source_type, source_record_id,
        created_by_identity_id, metadata
      ) values (
        ${id}, ${input.orgId}, ${objectKey}, ${input.fileName}, ${parsed.contentType},
        ${parsed.data.length}, null, 's3', ${checksum}, ${uploaded.ETag || null},
        ${input.sourceType}, ${input.sourceRecordId || null}, ${input.createdByIdentityId || null},
        ${sql.json((input.metadata || {}) as any)}
      )
      returning id, file_name, content_type, byte_size, source_type, source_record_id, created_at
    `;
    return file;
  } catch (error) {
    await storage.client.send(new DeleteObjectCommand({
      Bucket: storage.bucket,
      Key: objectKey,
    })).catch(() => undefined);
    throw error;
  } finally {
    await sql.end();
  }
}

export async function getTenantFile(orgId: string, id: string) {
  const sql = getSql();
  try {
    const [file] = await sql`
      select id, object_key, file_name, content_type, byte_size, file_data,
        storage_provider, checksum_sha256, source_type, source_record_id, created_at
      from tenant_private_files
      where org_id = ${orgId} and id = ${id}
      limit 1
    `;
    return file || null;
  } finally {
    await sql.end();
  }
}

async function loadTenantFileBody(file: Record<string, unknown>) {
  if (String(file.storage_provider || 'database') === 'database') {
    const body = file.file_data as Uint8Array | null;
    if (!body) throw new Error('The legacy file payload is missing.');
    return Uint8Array.from(body);
  }

  const storage = getObjectStorage();
  const object = await storage.client.send(new GetObjectCommand({
    Bucket: storage.bucket,
    Key: String(file.object_key || ''),
  }));
  if (!object.Body) throw new Error('The stored file payload is missing.');
  const body = await object.Body.transformToByteArray();
  const expectedChecksum = String(file.checksum_sha256 || '');
  if (expectedChecksum) {
    const actualChecksum = createHash('sha256').update(body).digest('hex');
    if (actualChecksum !== expectedChecksum) throw new Error('The stored file failed its integrity check.');
  }
  return body;
}

export async function tenantFileResponse(file: Record<string, unknown>) {
  const fileName = String(file.file_name || 'attachment').replace(/[\r\n"]/g, '');
  const contentType = String(file.content_type || 'application/octet-stream');
  const body = await loadTenantFileBody(file);
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
