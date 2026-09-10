import "server-only";
import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function storage() {
  const endpoint = process.env.HEARTHOS_OBJECT_STORAGE_ENDPOINT;
  const bucket = process.env.HEARTHOS_OBJECT_STORAGE_BUCKET;
  const accessKeyId = process.env.HEARTHOS_OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.HEARTHOS_OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("Private report storage is not configured.");
  return { bucket, client: new S3Client({ endpoint, region: process.env.HEARTHOS_OBJECT_STORAGE_REGION || "auto", credentials: { accessKeyId, secretAccessKey } }) };
}
export async function putReportObject(key: string, bytes: Buffer, contentType: string) {
  const { client, bucket } = storage();
  const checksum = createHash("sha256").update(bytes).digest("hex");
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType, Metadata: { checksum } }), { abortSignal: AbortSignal.timeout(20_000) });
  return checksum;
}
export async function getReportObject(key: string, checksum: string) {
  const { client, bucket } = storage();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) });
  if (!response.Body || (response.ContentLength || 0) > 20_000_000) throw new Error("Report file unavailable.");
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  if (createHash("sha256").update(bytes).digest("hex") !== checksum) throw new Error("Report file integrity check failed.");
  return bytes;
}

/** Administrator diagnostic: only its own random synthetic object can be removed. */
export async function verifyReportStorage(orgId: string) {
  const key = `service-reports/${orgId}/verification/${crypto.randomUUID()}.txt`;
  const bytes = Buffer.from("HearthOS synthetic report storage verification");
  const {client,bucket} = storage();
  let uploaded = false;
  try {
    const checksum = await putReportObject(key,bytes,"text/plain"); uploaded = true;
    if (!(await getReportObject(key,checksum)).equals(bytes)) throw new Error("Storage verification failed.");
  } finally {
    if (uploaded) await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(20_000)});
    client.destroy();
  }
  return {upload:true,download:true,integrity:true,syntheticObjectRemoved:true};
}
