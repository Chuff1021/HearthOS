import "server-only";
import postgres from "postgres";
import { loadImage, createCanvas } from "canvas";
import { requireCrmActor } from "../security/crm-access";
import { canAccessJob, isOfficeActor, type CrmActor } from "../security/access-policy";
import { isSmtpConfigured, sendSmtpEmail } from "../email/smtp";
import { createServiceReportStore, ReportError, type ReportContext } from "./store";
import { putReportObject, getReportObject } from "./storage";
import { renderServiceReportPdf } from "./pdf";
import { decodeLegacyJob } from "./legacy-photos";

let connection: ReturnType<typeof postgres> | undefined;
export function reportSql() {
  if (!process.env.DATABASE_URL) throw new ReportError("Report database is not configured.", 503);
  return connection ??= postgres(process.env.DATABASE_URL, { max: 4, idle_timeout: 20, connect_timeout: 10 });
}
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function serviceReportContext(actor: CrmActor, jobId: string): Promise<ReportContext> {
  if (!uuid(jobId)) throw new ReportError("Invalid job ID.");
  const sql = reportSql();
  // The released job store is Aaron's legacy store, not a multi-tenant table.
  // Explicitly bind it to its existing organization; never reuse for other tenants.
  const [org] = await sql`SELECT id FROM organizations WHERE id=${actor.orgId} AND slug='default'`;
  if (!org) throw new ReportError("Job not found.", 404);
  const [row] = await sql`SELECT payload FROM hearth_jobs_store WHERE id=${jobId}`;
  const job = decodeLegacyJob(row?.payload);
  if (!job || !canAccessJob(actor, { assignedTechs: Array.isArray(job.assignedTechs) ? job.assignedTechs : [] })) throw new ReportError("Job not found.", 404);
  const [customer] = await sql`SELECT id, email FROM customers WHERE org_id=${actor.orgId} AND (id::text=${String(job.customerId || "")} OR qb_customer_id=${String(job.customerId || "")}) LIMIT 1`;
  if (!customer) throw new ReportError("Link this job to a customer record before creating its service report.", 409);
  const text = String(job.fireplaceUnit?.type || job.title || "").toLowerCase();
  const fuels = (["gas", "wood", "pellet"] as const).filter(fuel => new RegExp(`\\b${fuel}\\b`).test(text));
  return { jobId, jobNumber: String(job.jobNumber || ""), customerId: String(customer.id), customerName: String(job.customerName || ""), address: String(job.propertyAddress || ""),
    serviceDate: String(job.scheduledDate || ""), equipment: [job.fireplaceUnit?.brand,job.fireplaceUnit?.model].filter(Boolean).join(" "),
    technicianId: actor.employeeId, technicianName: actor.name, suggestedFuel: fuels.length === 1 ? fuels[0] : null, email: customer.email || "", canVerifyStorage: ["owner","admin"].includes(actor.role) };
}
export function serviceReportStore() {
  return createServiceReportStore(reportSql(), {
    context: serviceReportContext, put: putReportObject, get: getReportObject, render: renderServiceReportPdf,
    send: async ({ email, bytes, report, actionId }) => {
      await sendSmtpEmail({ to: email, attempts: 1, messageId: `<service-report-${actionId}@hearth-os.vercel.app>`,
        subject: `Your ${report.data.fuel} service report - Aaron's Fireplace Co.`,
        text: `Thank you for choosing Aaron's Fireplace Co.\n\nYour completed service report for ${report.serviceDate} is attached, including findings and service photographs. Please review any recommendations and operating restrictions recorded in the report.\n\nReply to this email with questions.`,
        html: `<div style="font-family:Arial,sans-serif;color:#202630;max-width:600px"><h2>Aaron's Fireplace Co.</h2><p>Thank you for choosing us. Your completed service report is attached, including findings and service photographs.</p><p>Please review the recommendations and any operating restrictions recorded in your report.</p><p>Reply to this email with questions.</p></div>`,
        attachments: [{ filename: `Service Report ${report.id}.pdf`, content: bytes, contentType: "application/pdf" }] });
    },
  });
}
export async function reportActor(request: Request) {
  if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403, headers: privateHeaders });
  const actor = await requireCrmActor();
  if (!isOfficeActor(actor) && actor.role !== "technician") return Response.json({ error: "Report access denied." }, { status: 403, headers: privateHeaders });
  return actor;
}
export function reportFailure(error: unknown) {
  const expected = error instanceof ReportError;
  if (!expected) console.warn("[service-reports] Request failed; saved reports are unchanged.");
  return Response.json({ error: expected ? error.message : "Service reports are temporarily unavailable. Your saved records are unchanged." }, { status: expected ? error.status : 503, headers: privateHeaders });
}
export async function reportJson(request: Request) {
  const buffer = await boundedBody(request, 200_000);
  try { return JSON.parse(buffer.toString("utf8")); } catch { throw new ReportError("Invalid report request."); }
}
export async function boundedBody(request: Request, limit: number) {
  if (!request.body || Number(request.headers.get("content-length") || 0) > limit) throw new ReportError("Upload is too large.", 413);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > limit) throw new ReportError("Upload is too large.", 413); chunks.push(next.value); }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}
export async function normalizeReportPhoto(file: File) {
  if (!file.size || file.size > 1_500_000 || !["image/jpeg","image/png"].includes(file.type)) throw new ReportError("Use a JPG or PNG photo smaller than 1.5 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!jpeg && !png) throw new ReportError("The upload is not a valid JPG or PNG image.");
  try {
    const image = await loadImage(buffer);
    if (!image.width || !image.height || image.width * image.height > 25_000_000) throw new Error("dimensions");
    const scale = Math.min(1, 1200 / Math.max(image.width,image.height));
    const canvas = createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const bytes = canvas.toBuffer("image/jpeg", { quality: 0.72 });
    if (bytes.length > 350_000) throw new Error("size");
    return bytes;
  } catch { throw new ReportError("Photo could not be processed. Try a smaller JPG or PNG."); }
}
export function assertMailConfigured() { if (!isSmtpConfigured()) throw new ReportError("Customer email is not configured. The report is saved; contact the office.", 503); }
