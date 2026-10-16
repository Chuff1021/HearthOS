import { createCanvas } from "canvas";
import { renderServiceReportPdf } from "./pdf";
import { getServiceTemplate } from "./templates";
import type { ReportSnapshot } from "./domain";

/** No customer data, database writes, signatures by real staff, or email. */
export async function verifyServiceReportPdf(): Promise<Buffer> {
  const template = getServiceTemplate("gas", 2);
  const photo = { id: "synthetic-photo", slotId: "overview", caption: "Synthetic renderer test image; not a customer photograph." };
  const snapshot: ReportSnapshot = {
    id: "synthetic-pdf-check", revision: 1, jobId: "synthetic-job", jobNumber: "DIAGNOSTIC ONLY", customerId: "synthetic-customer",
    customerName: "Synthetic PDF Test", address: "", equipment: "Synthetic test appliance", serviceDate: "2026-10-16",
    technicianId: "synthetic-technician", technicianName: "Synthetic Test", finalizedAt: "2026-10-16T12:00:00Z",
    data: { fuel: "gas", templateVersion: 2, answers: {
      serviceDate: "2026-10-16", unitMake: "Synthetic", unitModel: "PDF test", gasFuel: "NG", pilotType: "IPI", applianceType: "Fireplace",
      diagnosticResults: "DIAGNOSTIC ONLY. No inspection performed. Not a customer report.",
    }, customerAcknowledgment: "", photoExceptions: Object.fromEntries(template.photoSlots.filter(s => s.required && s.id !== photo.slotId)
      .map(s => [s.id, "Synthetic runtime test; no actual appliance or inspection."])) },
    photos: [photo],
  };
  const canvas = createCanvas(320, 180);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, 320, 180);
  context.fillStyle = "#333333"; context.fillRect(40, 40, 240, 100);
  const bytes = await renderServiceReportPdf(snapshot, [{ ...photo, bytes: canvas.toBuffer("image/jpeg") }]);
  if (bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.length < 1000) throw new Error("PDF renderer did not produce a valid document.");
  return bytes;
}
