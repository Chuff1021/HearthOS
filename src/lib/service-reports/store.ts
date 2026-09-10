import type { Sql } from "postgres";
import type { CrmActor } from "../security/access-policy";
import { getServiceTemplate } from "./templates";
import { validateReport, type Fuel, type Photo, type ReportData, type ReportSnapshot } from "./domain";

export class ReportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type ReportContext = Omit<ReportSnapshot, "id" | "revision" | "finalizedAt" | "data" | "photos"> & { email: string; suggestedFuel: Fuel | null; canVerifyStorage?: boolean };
type Row = { id: string; job_id: string; customer_id: string; revision: number; status: string; data: ReportData; snapshot: ReportSnapshot | null; pdf_key: string; pdf_checksum: string; created_at: Date; updated_at: Date; finalized_at: Date | null };
type PhotoRow = { id: string; slot_id: string; caption: string; object_key: string; checksum: string };
type Dependencies = {
  context: (actor: CrmActor, jobId: string) => Promise<ReportContext>;
  put: (key: string, bytes: Buffer, type: string) => Promise<string>;
  get: (key: string, checksum: string) => Promise<Buffer>;
  render: (snapshot: ReportSnapshot, photos: Array<Photo & { bytes: Buffer }>) => Promise<Buffer>;
  send: (input: { email: string; bytes: Buffer; report: ReportSnapshot; actionId: string }) => Promise<void>;
};

export function parseReportData(input: unknown, fuel?: Fuel): ReportData {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ReportError("Invalid report data.");
  const raw = input as ReportData;
  if (!["gas", "wood", "pellet"].includes(raw.fuel) || (fuel && raw.fuel !== fuel)) throw new ReportError("Choose the correct service form before starting a new report.");
  const template = getServiceTemplate(raw.fuel);
  const fieldIds = new Set(template.sections.flatMap(s => s.fields.map(f => f.id)));
  const slots = new Set(template.photoSlots.map(s => s.id));
  const strings = (value: unknown, keys: Set<string>) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReportError("Invalid report answers.");
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!keys.has(key) || typeof item !== "string" || item.length > 12000) throw new ReportError("Invalid or oversized report answer.");
      result[key] = item;
    }
    return result;
  };
  if (typeof raw.customerAcknowledgment !== "string" || raw.customerAcknowledgment.length > 4000) throw new ReportError("Invalid acknowledgment.");
  return { fuel: raw.fuel, answers: strings(raw.answers, fieldIds), photoExceptions: strings(raw.photoExceptions, slots), customerAcknowledgment: raw.customerAcknowledgment };
}

export function createServiceReportStore(sql: Sql, deps: Dependencies) {
  async function row(tx: Sql, actor: CrmActor, id: string, lock = false) {
    const rows = lock
      ? await tx<Row[]>`SELECT * FROM hearth_service_reports WHERE org_id=${actor.orgId} AND id=${id} FOR UPDATE`
      : await tx<Row[]>`SELECT * FROM hearth_service_reports WHERE org_id=${actor.orgId} AND id=${id}`;
    if (!rows[0]) throw new ReportError("Report not found.", 404);
    if (actor.role === "technician") await deps.context(actor, rows[0].job_id);
    return rows[0];
  }
  async function photos(tx: Sql, actor: CrmActor, id: string) {
    return tx<PhotoRow[]>`SELECT * FROM hearth_service_report_photos WHERE org_id=${actor.orgId} AND report_id=${id} ORDER BY created_at,id`;
  }
  const photoView = (p: PhotoRow): Photo => ({ id: p.id, slotId: p.slot_id, caption: p.caption });
  async function view(tx: Sql, actor: CrmActor, report: Row) {
    const [delivery] = await tx`SELECT status FROM hearth_service_report_delivery WHERE org_id=${actor.orgId} AND report_id=${report.id} ORDER BY created_at DESC LIMIT 1`;
    return { id: report.id, jobId: report.job_id, customerId: report.customer_id, revision: report.revision, status: report.status, data: report.data,
      photos: (await photos(tx, actor, report.id)).map(photoView), finalizedAt: report.finalized_at?.toISOString(), technicianName: report.snapshot?.technicianName,
      createdAt: report.created_at.toISOString(), updatedAt: report.updated_at.toISOString(), emailStatus: delivery?.status };
  }
  function editable(report: Row, revision: number) {
    if (report.status !== "draft") throw new ReportError("Finalized reports cannot be changed. Start a new report for corrections.", 409);
    if (report.revision !== revision) throw new ReportError("This report changed in another session. Reload before saving.", 409);
  }
  return {
    async list(actor: CrmActor, filter: { jobId?: string; customerId?: string }) {
      const result = await sql<Row[]>`SELECT * FROM hearth_service_reports WHERE org_id=${actor.orgId}
        AND (${filter.jobId || null}::text IS NULL OR job_id=${filter.jobId || null})
        AND (${filter.customerId || null}::text IS NULL OR customer_id=${filter.customerId || null}) ORDER BY created_at DESC LIMIT 100`;
      const output = [];
      for (const report of result) { if (actor.role === "technician") await deps.context(actor, report.job_id); output.push(await view(sql, actor, report)); }
      return output;
    },
    async create(actor: CrmActor, jobId: string, fuel: Fuel) {
      const context = await deps.context(actor, jobId);
      const data = parseReportData({ fuel, answers: {}, photoExceptions: {}, customerAcknowledgment: "" });
      const [report] = await sql<Row[]>`INSERT INTO hearth_service_reports(id,org_id,job_id,customer_id,data,created_by)
        VALUES (${crypto.randomUUID()},${actor.orgId},${jobId},${context.customerId},${sql.json(data)},${actor.employeeId}) RETURNING *`;
      return view(sql, actor, report);
    },
    async save(actor: CrmActor, id: string, revision: number, input: unknown) {
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const report = await row(tx, actor, id, true); editable(report, revision);
        const data = parseReportData(input, report.data.fuel);
        const [saved] = await tx<Row[]>`UPDATE hearth_service_reports SET data=${tx.json(data)},revision=revision+1,updated_at=now() WHERE org_id=${actor.orgId} AND id=${id} RETURNING *`;
        return view(tx, actor, saved);
      });
    },
    async addPhoto(actor: CrmActor, id: string, revision: number, slotId: string, caption: string, bytes: Buffer) {
      if (typeof caption !== "string" || caption.length > 500) throw new ReportError("Photo captions must be 500 characters or fewer.");
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const report = await row(tx, actor, id, true); editable(report, revision);
        if (!getServiceTemplate(report.data.fuel).photoSlots.some(s => s.id === slotId)) throw new ReportError("Unknown photo requirement.");
        if ((await photos(tx, actor, id)).length >= 30) throw new ReportError("This report has reached its 30-photo limit.");
        const photoId = crypto.randomUUID();
        const key = `service-reports/${actor.orgId}/${id}/photos/${photoId}.jpg`;
        const checksum = await deps.put(key, bytes, "image/jpeg");
        await tx`INSERT INTO hearth_service_report_photos(org_id,report_id,id,slot_id,caption,object_key,checksum,uploaded_by)
          VALUES (${actor.orgId},${id},${photoId},${slotId},${caption},${key},${checksum},${actor.employeeId})`;
        const [saved] = await tx<Row[]>`UPDATE hearth_service_reports SET revision=revision+1,updated_at=now() WHERE org_id=${actor.orgId} AND id=${id} RETURNING *`;
        return view(tx, actor, saved);
      });
    },
    async removePhoto(actor: CrmActor, id: string, photoId: string, revision: number) {
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const report = await row(tx, actor, id, true); editable(report, revision);
        const removed = await tx`DELETE FROM hearth_service_report_photos WHERE org_id=${actor.orgId} AND report_id=${id} AND id=${photoId} RETURNING id`;
        if (!removed.length) throw new ReportError("Photo not found.", 404);
        // Keep the private object for retention; never delete finalized assets.
        const [saved] = await tx<Row[]>`UPDATE hearth_service_reports SET revision=revision+1,updated_at=now() WHERE org_id=${actor.orgId} AND id=${id} RETURNING *`;
        return view(tx, actor, saved);
      });
    },
    async finalize(actor: CrmActor, id: string, revision: number) {
      return sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const report = await row(tx, actor, id, true);
        // A retry after a lost response returns the same immutable report.
        if (report.status === "finalized" && report.revision === revision + 1) return view(tx, actor, report);
        editable(report, revision);
        const photoRows = await photos(tx, actor, id);
        const context = await deps.context(actor, report.job_id);
        if (context.customerId !== report.customer_id) throw new ReportError("The job's customer changed. Start a new report for the correct customer.", 409);
        const finalData: ReportData = { ...report.data, answers: { ...report.data.answers, technicianName: actor.name } };
        const errors = validateReport(finalData, photoRows.map(photoView));
        if (errors.length) throw new ReportError(errors.slice(0,8).join(" "));
        const serviceDate = finalData.answers.serviceDate;
        const visitDate = new Date(`${serviceDate}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate || "") || Number.isNaN(visitDate.getTime()) || visitDate.toISOString().slice(0,10) !== serviceDate) {
          throw new ReportError("Enter the actual service date as a valid calendar date (YYYY-MM-DD) before finalizing.");
        }
        const snapshot: ReportSnapshot = { ...context, id, revision: report.revision + 1, finalizedAt: new Date().toISOString(),
          serviceDate, address: finalData.answers.serviceAddress?.trim() || context.address,
          equipment: finalData.answers.makeModel?.trim() || context.equipment,
          jobNumber: context.jobNumber || finalData.answers.jobNumber?.trim() || "",
          technicianId: actor.employeeId, technicianName: actor.name, data: finalData, photos: photoRows.map(photoView) };
        const embedded = [];
        for (const photo of photoRows) embedded.push({ ...photoView(photo), bytes: await deps.get(photo.object_key, photo.checksum) });
        const pdf = await deps.render(snapshot, embedded);
        if (pdf.length > 12_000_000) throw new ReportError("Report exceeds the email attachment limit. Contact the office before finalizing.");
        const key = `service-reports/${actor.orgId}/${id}/final/${crypto.randomUUID()}.pdf`;
        const checksum = await deps.put(key, pdf, "application/pdf");
        const [saved] = await tx<Row[]>`UPDATE hearth_service_reports SET status='finalized',data=${tx.json(finalData)},snapshot=${tx.json(snapshot)},pdf_key=${key},pdf_checksum=${checksum},
          finalized_by=${actor.employeeId},finalized_at=${snapshot.finalizedAt},revision=revision+1,updated_at=now() WHERE org_id=${actor.orgId} AND id=${id} RETURNING *`;
        return view(tx, actor, saved);
      });
    },
    async file(actor: CrmActor, id: string, photoId?: string) {
      const report = await row(sql, actor, id);
      if (photoId) {
        const photo = (await photos(sql, actor, id)).find(p => p.id === photoId);
        if (!photo) throw new ReportError("Photo not found.", 404);
        return { bytes: await deps.get(photo.object_key, photo.checksum), type: "image/jpeg", name: `${photoId}.jpg` };
      }
      if (report.status !== "finalized") throw new ReportError("Finalize the report before downloading the PDF.", 409);
      return { bytes: await deps.get(report.pdf_key, report.pdf_checksum), type: "application/pdf", name: `Service Report ${id}.pdf` };
    },
    async email(actor: CrmActor, id: string, actionId: string, email: string) {
      if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email) || email.length > 254) throw new ReportError("Enter one valid customer email address.");
      const result = await sql.begin(async transaction => {
        const tx = transaction as unknown as Sql;
        const report = await row(tx, actor, id, true);
        if (report.status !== "finalized" || !report.snapshot) throw new ReportError("Finalize and save the report before emailing.", 409);
        const [prior] = await tx`SELECT * FROM hearth_service_report_delivery WHERE org_id=${actor.orgId} AND action_id=${actionId}`;
        if (prior) {
          if (prior.report_id !== id || prior.recipient !== email) throw new ReportError("Send request conflicts with an earlier attempt.", 409);
          return { status: prior.status as string, report, claimed: false };
        }
        const [pending] = await tx`SELECT action_id FROM hearth_service_report_delivery WHERE org_id=${actor.orgId} AND report_id=${id} AND status IN ('sending','uncertain') LIMIT 1`;
        if (pending) throw new ReportError("A previous email attempt is pending or uncertain. Ask the office to verify delivery before resending.", 409);
        await tx`INSERT INTO hearth_service_report_delivery(org_id,report_id,action_id,recipient,status,requested_by) VALUES (${actor.orgId},${id},${actionId},${email},'sending',${actor.employeeId})`;
        return { status: "sending", report, claimed: true };
      });
      if (!result.claimed) return { status: result.status };
      let attempted = false;
      try {
        const bytes = await deps.get(result.report.pdf_key, result.report.pdf_checksum);
        attempted = true;
        await deps.send({ email, bytes, report: result.report.snapshot!, actionId });
        await sql`UPDATE hearth_service_report_delivery SET status='accepted',updated_at=now() WHERE org_id=${actor.orgId} AND action_id=${actionId}`;
        return { status: "accepted" };
      } catch {
        await sql`UPDATE hearth_service_report_delivery SET status=${attempted ? "uncertain" : "failed"},updated_at=now() WHERE org_id=${actor.orgId} AND action_id=${actionId}`;
        throw new ReportError(attempted ? "Email delivery could not be confirmed. The report is saved; ask the office to verify before resending." : "The saved PDF could not be loaded. No email was attempted. Please retry.", 503);
      }
    },
  };
}
