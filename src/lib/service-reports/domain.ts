import { getServiceTemplate, outcomeOptions, type Fuel } from "./templates";

export type { Fuel, Field, Template } from "./templates";
export type ReportData = {
  fuel: Fuel;
  answers: Record<string, string>;
  photoExceptions: Record<string, string>;
  customerAcknowledgment: string;
};
export type Photo = { id: string; slotId: string; caption: string };
export type ReportSnapshot = {
  id: string;
  revision: number;
  jobId: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
  address: string;
  serviceDate: string;
  equipment: string;
  technicianName: string;
  technicianId: string;
  finalizedAt: string;
  data: ReportData;
  photos: Photo[];
};

export const serviceReportLimits = { fieldCharacters: 12_000, totalCharacters: 160_000, photos: 30, photoBytes: 350 * 1024, reasonCharacters: 10 };
// Reject invisible controls instead of silently changing finalized evidence or identity.
const unsafeControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
export function isSafeReportString(value: unknown, maximum = serviceReportLimits.fieldCharacters): value is string {
  return typeof value === "string" && value.length <= maximum && !unsafeControls.test(value)
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Validate untrusted drafts as well as typed callers. Never infer a satisfactory result. */
export function validateReport(data: ReportData, photos: Photo[]): string[] {
  const errors: string[] = [];
  if (!record(data) || !["gas", "wood", "pellet"].includes(data.fuel as string)) return ["Unsupported service report fuel."];
  if (!record(data.answers) || !record(data.photoExceptions)) return ["Answers and photo exceptions must be string records."];
  if (!Array.isArray(photos)) return ["Photos must be an array."];
  const template = getServiceTemplate(data.fuel);
  const fields = template.sections.flatMap((s) => s.fields);
  const fieldIds = new Set(fields.map((f) => f.id));
  const slots = new Set(template.photoSlots.map((s) => s.id));
  const answers = data.answers;
  const serviceDate = typeof answers.serviceDate === "string" ? answers.serviceDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !Number.isFinite(Date.parse(`${serviceDate}T12:00:00Z`))
    || new Date(`${serviceDate}T12:00:00Z`).toISOString().slice(0, 10) !== serviceDate) {
    errors.push("Service date is required and must be a valid calendar date in YYYY-MM-DD format (serviceDate).");
  }
  const value = (id: string) => typeof answers[id] === "string" ? answers[id].trim() : "";
  const reason = (id: string, label: string) => {
    if (value(id).length < serviceReportLimits.reasonCharacters) errors.push(`${label}: explain in at least 10 characters (${id}).`);
  };
  let characters = 0;
  for (const [id, answer] of Object.entries(answers)) {
    if (!fieldIds.has(id)) errors.push(`Unsupported answer field: ${id}.`);
    if (!isSafeReportString(answer)) errors.push(`Invalid text or excessive length in answer ${id}.`);
    if (typeof answer === "string") characters += answer.length;
  }
  for (const field of fields) {
    const answer = value(field.id);
    if (field.required && !answer) errors.push(`${field.label} is required (${field.id}).`);
    if (answer && (field.type === "condition" || field.type === "select") && !field.options?.includes(answer)) {
      errors.push(`${field.label}: unsupported value "${answer}" (${field.id}).`);
    }
    if (field.type === "condition" && ["D", "NI"].includes(answer)) reason(`${field.id}_notes`, field.label);
    if (field.id.startsWith("access_") && field.type === "select" && answer === "NI") reason(`${field.id}_notes`, field.label);
  }

  const photoIds = new Set<string>();
  const populatedSlots = new Set<string>();
  if (photos.length > serviceReportLimits.photos) errors.push(`At most ${serviceReportLimits.photos} photos are supported; no photos may be silently dropped.`);
  for (const photo of photos) {
    if (!record(photo) || !isSafeReportString(photo.id, 200) || !photo.id.trim()
      || !isSafeReportString(photo.slotId, 100) || !isSafeReportString(photo.caption, 2000)) {
      errors.push("Each photo needs a valid ID, slot ID and text caption (maximum 2000 characters).");
      continue;
    }
    if (photoIds.has(photo.id)) errors.push(`Duplicate photo ID: ${photo.id}.`);
    photoIds.add(photo.id);
    if (!slots.has(photo.slotId)) errors.push(`Unsupported photo slot: ${photo.slotId}.`);
    else populatedSlots.add(photo.slotId);
    characters += photo.caption.length;
  }
  for (const [id, exception] of Object.entries(data.photoExceptions)) {
    if (!slots.has(id)) errors.push(`Unsupported photo exception slot: ${id}.`);
    if (!isSafeReportString(exception) || exception.trim().length < serviceReportLimits.reasonCharacters) {
      errors.push(`Photo exception ${id}: explain in at least 10 characters using valid text.`);
    }
    if (typeof exception === "string") characters += exception.length;
  }
  for (const slot of template.photoSlots) {
    const required = slot.required || value(slot.id) === "D";
    const exception = data.photoExceptions[slot.id];
    if (required && !populatedSlots.has(slot.id) && !(isSafeReportString(exception) && exception.trim().length >= 10)) {
      errors.push(`${slot.label}: photo or documented exception of at least 10 characters required (${slot.id}).`);
    }
  }
  if (!isSafeReportString(data.customerAcknowledgment) || data.customerAcknowledgment.trim().length < 10) {
    errors.push("Customer acknowledgment: record receipt, or unavailable / declined with a reason, in at least 10 characters.");
  } else characters += data.customerAcknowledgment.length;
  if (characters > serviceReportLimits.totalCharacters) errors.push("Report text exceeds the supported total length; split into separate reports without dropping evidence.");

  if (["Limited", "Withheld"].includes(value("testing"))) reason("testingReason", "Testing not fully performed");
  if (["cleaningPreparation", "shutdownPreparation", "electricalPreparation"].some((id) => value(id) === "Not performed")) {
    reason("cleaningPreparationReason", "Preparation not performed");
  }
  for (const [choice, detail] of [["applianceType", "applianceOther"], ["venting", "ventingOther"], ["ignition", "ignitionOther"], ["chimneyType", "chimneyOther"]]) {
    if (value(choice) === "Other" && !value(detail)) errors.push(`Describe the other selection (${detail}).`);
  }
  if (value("outcome") === outcomeOptions[0] && fields.some((f) => f.type === "condition" && value(f.id) === "D")) {
    errors.push("Recorded defects cannot be combined with a no-unresolved-defects outcome; record the current condition and corrections explicitly.");
  }
  if (value("outcome") && value("outcome") !== outcomeOptions[0]) {
    reason("restrictions", "Restrictions / isolation action / person notified");
    reason("workPending", "Pending correction or additional inspection");
  }
  if (value("outcome") === outcomeOptions[2] && !value("customerNotifiedTime")) errors.push("Do not operate outcome requires customer notification time (customerNotifiedTime).");
  if (["Unavailable", "Declined"].includes(value("acknowledgmentStatus"))) reason("acknowledgmentDelivery", "Acknowledgment delivery method and date");
  if (value("acknowledgmentStatus") === "Receipt recorded" && (!value("customerRepresentative") || !value("acknowledgmentDateTime"))) {
    errors.push("Recorded receipt requires the customer / representative name and acknowledgment date / time; it is not a generated customer signature.");
  }

  // Partial measurement rows must carry their units and model-specific criterion, never universal limits.
  for (const field of fields.filter((f) => f.id.endsWith("_initial"))) {
    const prefix = field.id.replace(/_initial$/, "");
    if (value(`${prefix}_initial`) || value(`${prefix}_final`)) {
      for (const suffix of ["units", "criterion"]) if (!value(`${prefix}_${suffix}`)) errors.push(`${field.label}: ${suffix} required for a recorded reading (${prefix}_${suffix}).`);
    }
  }
  for (const field of fields.filter((f) => f.id.startsWith("measure_") && f.id.endsWith("_actual"))) {
    if (value(field.id) && !value(field.id.replace(/_actual$/, "_required"))) errors.push(`${field.label}: required value / governing reference must be recorded.`);
  }
  if (data.fuel === "wood") {
    if (!/^[1-9]\d*$/.test(value("totalFlues")) || !Number.isSafeInteger(Number(value("totalFlues")))) errors.push("Total flues must be a positive whole number (totalFlues).");
    const total = Number(value("totalFlues"));
    for (let n = 1; n <= Math.min(total, 3); n++) {
      if (!value(`flue${n}_id`) || !value(`flue${n}_appliance`)) errors.push(`Inventory needs flue ${n} ID and connected appliance / location.`);
    }
    if (total > 3) reason("additionalFlues", "Additional flues and connected appliances");
    if (value("scan") === "Not performed") reason("scanReason", "Internal flue scan not performed");
    if (value("operationCheck") === "Not performed") reason("operationConditions", "Operation / draft check not performed");
    if (value("scan") === "Performed") {
      if (!value("scanDevice") || !value("scanOperator")) errors.push("Record scan device / method and operator.");
      for (let n = 1; n <= Math.min(total, 3); n++) {
        if (!value(`scan${n}_flueId`) || !value(`scan${n}_coverage`) || !value(`scan${n}_files`)) errors.push(`Record scan ${n} flue ID, coverage / limitations and evidence file IDs.`);
        if (value(`scan${n}_flueId`) !== value(`flue${n}_id`)) errors.push(`Scan ${n} must identify the corresponding inventory flue ID.`);
      }
      if (total > 3) reason("additionalScans", "Additional flue scan coverage and evidence");
    }
    if (value("scopeStatus") === "Recorded scope complete" && (value("inspectionPerformed") === "Limited / incomplete"
      || (value("inspectionPerformed") === "Level 2" && (value("scan") !== "Performed"
        || fields.some((f) => f.id.startsWith("access_") && f.type === "select" && value(f.id) === "NI"))))) {
      errors.push("Incomplete inspection or missing Level 2 access / scan coverage must be recorded as incomplete; a scan alone does not establish inspection level.");
    }
    if (value("scopeStatus").startsWith("Incomplete")) {
      reason("accessLimits", "Incomplete inspection limitations");
      reason("furtherInvestigation", "Incomplete inspection next steps");
    }
  }
  return errors;
}
