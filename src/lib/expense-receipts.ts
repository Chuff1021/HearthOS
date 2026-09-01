import "server-only";

import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getStorage() {
  const endpoint = process.env.HEARTHOS_OBJECT_STORAGE_ENDPOINT;
  const bucket = process.env.HEARTHOS_OBJECT_STORAGE_BUCKET;
  const accessKeyId = process.env.HEARTHOS_OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.HEARTHOS_OBJECT_STORAGE_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Private receipt storage is not configured.");
  }

  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: process.env.HEARTHOS_OBJECT_STORAGE_REGION || "auto",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
    }),
  };
}

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/\r\n]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .slice(0, 140) || "receipt";
}

export function validateReceipt(file: File) {
  if (!ALLOWED_RECEIPT_TYPES.has(file.type.toLowerCase())) {
    throw new Error("Receipts must be a PDF, JPG, PNG, WebP, HEIC, or HEIF file.");
  }
  if (!file.size || file.size > MAX_RECEIPT_BYTES) {
    throw new Error("Receipt files must be 10 MB or smaller.");
  }
}

export async function storeExpenseReceipt(input: {
  expenseId: string;
  orgId: string;
  file: File;
}) {
  validateReceipt(input.file);
  const body = Buffer.from(await input.file.arrayBuffer());
  const checksum = createHash("sha256").update(body).digest("hex");
  const fileName = safeFileName(input.file.name);
  const objectKey = `aarons-expenses/${input.orgId}/${input.expenseId}/${fileName}`;
  const storage = getStorage();

  const uploaded = await storage.client.send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: objectKey,
    Body: body,
    ContentType: input.file.type,
    Metadata: {
      expense: input.expenseId,
      organization: input.orgId,
      checksum,
    },
  }));

  return {
    objectKey,
    fileName,
    contentType: input.file.type,
    byteSize: body.length,
    checksum,
    etag: uploaded.ETag || null,
  };
}

export async function deleteExpenseReceipt(objectKey: string) {
  const storage = getStorage();
  await storage.client.send(new DeleteObjectCommand({
    Bucket: storage.bucket,
    Key: objectKey,
  }));
}

export async function expenseReceiptResponse(receipt: {
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  checksum: string;
}) {
  const storage = getStorage();
  const object = await storage.client.send(new GetObjectCommand({
    Bucket: storage.bucket,
    Key: receipt.objectKey,
  }));
  if (!object.Body) throw new Error("The receipt file is missing.");

  const body = await object.Body.transformToByteArray();
  const actualChecksum = createHash("sha256").update(body).digest("hex");
  if (receipt.checksum && actualChecksum !== receipt.checksum) {
    throw new Error("The receipt failed its integrity check.");
  }

  const fileName = receipt.fileName.replace(/[\r\n"]/g, "");
  return new Response(Uint8Array.from(body).buffer, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(receipt.byteSize || body.byteLength),
      "Content-Type": receipt.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
