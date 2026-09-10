import { readFileSync } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";
import { isSafeReportString, serviceReportLimits, validateReport, type Photo, type ReportSnapshot } from "./domain";
import { acknowledgmentNotice, getServiceTemplate, outcomeOptions } from "./templates";

// The standalone build follows the existing invoice renderer and embeds its PDF resources.
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as typeof import("pdfkit");
type FontFace = { hasGlyphForCodePoint(code: number): boolean };
type PdfInternals = PDFKit.PDFDocument & {
  _font: { font: FontFace };
  openImage(bytes: ArrayBuffer): { width: number; height: number };
};
const COMPANY = {
  name: "AARON'S FIREPLACE CO, LLC",
  contact: "611 E HARRISON ST, REPUBLIC, MO 65738 | (417) 732-9775 | aaronsfireplaceco@yahoo.com",
};
const LEFT = 42;
const WIDTH = 528;
const TOP = 100;
const BOTTOM = 730;
const MAX_PAGES = 200;
const MAX_IMAGE_BYTES = serviceReportLimits.photoBytes;
const MAX_TOTAL_IMAGE_BYTES = serviceReportLimits.photos * MAX_IMAGE_BYTES;
const MAX_PIXELS = 30_000_000;
const colors = { ink: "#202421", muted: "#555e59", accent: "#27634d", line: "#d9dfdc", pale: "#edf2ef", alert: "#973929" };

function requireText(value: unknown, label: string, max = 2000): asserts value is string {
  if (!isSafeReportString(value, max) || !value.trim()) throw new Error(`Invalid ${label}; provide nonempty safe text (maximum ${max} characters).`);
}

/** No network image fetching: the caller supplies authorized bytes for this exact snapshot. */
export async function renderServiceReportPdf(snapshot: ReportSnapshot, photos: Array<Photo & { bytes: Buffer }>): Promise<Buffer> {
  if (!snapshot || typeof snapshot !== "object") throw new Error("A finalized report snapshot is required.");
  const errors = validateReport(snapshot.data, snapshot.photos);
  if (errors.length) throw new Error(`Service report is incomplete: ${errors.join(" ")}`);
  for (const key of ["id", "jobId", "customerId", "customerName", "technicianName", "technicianId", "serviceDate", "finalizedAt"] as const) {
    requireText(snapshot[key], key, ["id", "jobId", "customerId", "technicianId"].includes(key) ? 200 : 2000);
  }
  for (const key of ["jobNumber", "address", "equipment"] as const) {
    const maximum = key === "jobNumber" ? 200 : 2000;
    if (!isSafeReportString(snapshot[key], maximum)) throw new Error(`Invalid ${key}; provide safe text or an empty string (maximum ${maximum} characters).`);
  }
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1 || snapshot.revision > 1_000_000) throw new Error("Invalid report revision.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.serviceDate) || !Number.isFinite(Date.parse(`${snapshot.serviceDate}T12:00:00Z`))
    || new Date(`${snapshot.serviceDate}T12:00:00Z`).toISOString().slice(0, 10) !== snapshot.serviceDate) throw new Error("Invalid service date; use YYYY-MM-DD.");
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.finalizedAt) || !Number.isFinite(Date.parse(snapshot.finalizedAt))) throw new Error("Finalization timestamp must include a timezone.");
  if (!Array.isArray(photos) || photos.length !== snapshot.photos.length) throw new Error("Every snapshot photo must have exactly one supplied image; no missing or extra photos.");
  const photoMap = new Map<string, Photo & { bytes: Buffer }>();
  let byteCount = 0;
  for (const photo of photos) {
    if (!photo || !Buffer.isBuffer(photo.bytes) || photo.bytes.length === 0 || photo.bytes.length > MAX_IMAGE_BYTES) throw new Error("Each photo must contain a supported image buffer of at most 350 KiB.");
    if (photoMap.has(photo.id)) throw new Error(`Duplicate image bytes for photo ${photo.id}.`);
    photoMap.set(photo.id, photo);
    byteCount += photo.bytes.length;
  }
  if (byteCount > MAX_TOTAL_IMAGE_BYTES) throw new Error("Photo bytes exceed the report limit; reduce resolution without dropping evidence.");
  for (const photo of snapshot.photos) {
    const supplied = photoMap.get(photo.id);
    if (!supplied || supplied.slotId !== photo.slotId || supplied.caption !== photo.caption) throw new Error(`Image metadata does not match snapshot photo ${photo.id}.`);
  }
  // Capture inputs before decoding asynchronously so caller mutations cannot change the rendered revision.
  const report: ReportSnapshot = structuredClone(snapshot);
  const assets = report.photos.map((p) => ({ ...p, bytes: Buffer.from(photoMap.get(p.id)!.bytes) }));
  const template = getServiceTemplate(report.data.fuel);
  const publicLabel = `SR-${report.id.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase()}`;
  const completedAt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(report.finalizedAt));
  const serviceDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${report.serviceDate}T12:00:00Z`));
  const doc = new PDFDocument({ size: "LETTER", margins: { top: TOP, bottom: 42, left: LEFT, right: LEFT },
    autoFirstPage: false, bufferPages: true, info: { Title: template.title, Author: COMPANY.name, Subject: "Recorded service findings and photo evidence" } }) as PdfInternals;
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  // Observe stream failures even when preflight or drawing throws before awaiting the result.
  void result.catch(() => undefined);
  try {
    const geist = path.join(path.dirname(require.resolve("geist/font/sans")), "fonts/geist-sans");
    doc.registerFont("Body", readFileSync(path.join(geist, "Geist-Regular.ttf")));
    doc.registerFont("Bold", readFileSync(path.join(geist, "Geist-SemiBold.ttf")));
    doc.registerFont("Signature", readFileSync(path.join(process.cwd(), "public/fonts/service-signature-Allura-Regular.ttf")));
    const fontFaces = new Map<string, FontFace>();
    for (const font of ["Body", "Bold", "Signature"]) { doc.font(font); fontFaces.set(font, doc._font.font); }
    const checked = new Set<string>();
    function safe(value: string, font: string): string {
      if (!isSafeReportString(value)) throw new Error("Unsafe report text cannot be rendered.");
      for (const char of value) {
        if (char === "\n" || char === "\r" || char === "\t") continue;
        const key = `${font}:${char}`;
        if (!checked.has(key)) {
          if (!fontFaces.get(font)!.hasGlyphForCodePoint(char.codePointAt(0)!)) throw new Error(`The embedded ${font} font cannot represent U+${char.codePointAt(0)!.toString(16).toUpperCase()}; no text was dropped.`);
          checked.add(key);
        }
      }
      return value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
    }
    const images: Array<{ bytes: Buffer; width: number; height: number }> = [];
    for (const photo of assets) {
      const bytes = photo.bytes;
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!png && !jpeg) throw new Error(`Photo ${photo.id}: unsupported image type; supply decoded PNG or JPEG bytes.`);
      try {
        // Standalone PDFKit has its own Buffer implementation; ArrayBuffer is the shared boundary.
        const dimensions = doc.openImage(new Uint8Array(bytes).buffer);
        if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1
          || dimensions.width > 16_000 || dimensions.height > 16_000 || dimensions.width * dimensions.height > MAX_PIXELS) {
          throw new Error("Image dimensions exceed supported limits (30 megapixels / 16000 pixels per edge).");
        }
        const decoded = await loadImage(bytes);
        const canvas = createCanvas(decoded.width, decoded.height);
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(decoded, 0, 0);
        // Re-encoding validates actual pixel data and removes EXIF/location metadata; nothing is cropped.
        images.push({ bytes: canvas.toBuffer("image/jpeg", { quality: 0.94 }), width: canvas.width, height: canvas.height });
      } catch (error) { throw new Error(`Photo ${photo.id} cannot be decoded: ${error instanceof Error ? error.message : String(error)}`); }
    }

    let y = TOP;
    let pageCount = 0;
    function line(value: string, x: number, atY: number, font = "Body", size = 9, color = colors.ink) {
      doc.font(font).fontSize(size).fillColor(color).text(value, x, atY, { lineBreak: false });
    }
    function page() {
      if (++pageCount > MAX_PAGES) throw new Error(`Report exceeds ${MAX_PAGES} pages; no partial PDF will be returned.`);
      doc.addPage();
      line(COMPANY.name, LEFT, 30, "Bold", 12);
      line(COMPANY.contact, LEFT, 49, "Body", 7.3, colors.muted);
      line(template.title, LEFT, 67, "Bold", 12, colors.accent);
      doc.moveTo(LEFT, 88).lineTo(LEFT + WIDTH, 88).lineWidth(0.6).strokeColor(colors.line).stroke();
      y = TOP;
    }
    function ensure(height: number) { if (y + height > BOTTOM) page(); }
    function wrap(value: string, width: number, font = "Body", size = 9): string[] {
      doc.font(font).fontSize(size);
      const measure = (s: string) => doc.widthOfString(s);
      const lines: string[] = [];
      for (const paragraph of safe(value, font).split("\n")) {
        let current = "";
        // Break long unspaced identifiers as well as prose, retaining every non-whitespace character.
        for (const token of paragraph.split(/(\s+)/)) {
          if (!token) continue;
          if (measure(current + token) <= width) { current += token; continue; }
          if (current) { lines.push(current.trimEnd()); current = ""; }
          if (!token.trim()) continue;
          for (const char of token) {
            if (measure(current + char) > width && current) { lines.push(current); current = ""; }
            current += char;
          }
        }
        lines.push(current.trimEnd());
      }
      return lines;
    }
    function paragraph(value: string, font = "Body", size = 9, color = colors.ink) {
      const height = size * 1.5;
      for (const text of wrap(value, WIDTH, font, size)) { ensure(height); line(text, LEFT, y, font, size, color); y += height; }
      y += 5;
    }
    function heading(title: string) {
      ensure(62);
      y += 8;
      doc.rect(LEFT, y, WIDTH, 23).fill(colors.pale);
      line(title, LEFT + 8, y + 5, "Bold", 10, colors.accent);
      y += 31;
    }
    function row(label: string, value: string, alert = false) {
      const labels = wrap(label, 224, "Body", 8.3);
      const values = wrap(value, 284, alert ? "Bold" : "Body", 9);
      const count = Math.max(labels.length, values.length);
      if (count * 13 + 9 <= BOTTOM - TOP) ensure(count * 13 + 9);
      for (let n = 0; n < count; n++) {
        if (y + 13 > BOTTOM) {
          page();
          for (const continued of wrap(`${label} (continued)`, WIDTH, "Bold", 8)) {
            line(continued, LEFT, y, "Bold", 8, colors.muted); y += 12;
          }
        }
        if (labels[n]) line(labels[n], LEFT, y, "Body", 8.3, colors.muted);
        if (values[n]) line(values[n], LEFT + 244, y, alert ? "Bold" : "Body", 9, alert ? colors.alert : colors.ink);
        y += 13;
      }
      y += 5;
      doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(0.35).strokeColor(colors.line).stroke();
      y += 4;
    }
    const answers = report.data.answers;
    page();
    heading("Report and visit");
    for (const [label, value] of [
      ["Report", `${publicLabel} / Revision ${report.revision}`], ["Job number", report.jobNumber.trim() || "Not recorded"],
      ["Customer", report.customerName], ["Service address", report.address.trim() || "Not recorded"],
      ["Service date", serviceDate], ["Equipment", report.equipment.trim() || "Not recorded"], ["Technician", report.technicianName],
      ["Finalized", completedAt],
    ]) row(label, value);
    heading("Recorded outcome and restrictions");
    paragraph(answers.outcome, "Bold", 11, answers.outcome === outcomeOptions[0] ? colors.ink : colors.alert);
    row("Restrictions / isolation / person notified", answers.restrictions, answers.outcome !== outcomeOptions[0]);
    row("Pending / declined work and follow-up", answers.workPending);
    for (const field of template.sections.flatMap((s) => s.fields).filter((f) => f.type === "condition" && answers[f.id] === "D")) {
      row(`${field.id} - recorded defect`, answers[`${field.id}_notes`], true);
    }
    paragraph("S = satisfactory within recorded scope; D = defect; NA = not applicable; NI = not inspected. Optional entries not supplied are not recorded, never assumed satisfactory.", "Body", 8, colors.muted);
    const snapshotFields = new Set(["customerName", "serviceAddress", "serviceDate", "jobNumber", "technicianName"]);
    const statusLabels: Record<string, string> = { S: "S - Satisfactory within scope", D: "D - Defect", NA: "NA - Not applicable", NI: "NI - Not inspected" };
    for (const section of template.sections) {
      const fields = section.fields.filter((field) => !snapshotFields.has(field.id) && typeof answers[field.id] === "string" && answers[field.id].trim());
      if (!fields.length) continue;
      heading(section.title);
      for (const field of fields) row(field.label, field.type === "condition" ? statusLabels[answers[field.id].trim()] : answers[field.id],
        field.type === "condition" && answers[field.id].trim() === "D");
    }
    heading("Customer acknowledgment record");
    paragraph(acknowledgmentNotice, "Body", 8, colors.muted);
    paragraph(report.data.customerAcknowledgment);
    paragraph("Recorded acknowledgment only. No customer signature has been generated.", "Body", 8, colors.muted);

    // Keep the typed name, plain-text identity and exact finalization timestamp together.
    const signatureLines = wrap(report.technicianName, WIDTH, "Signature", 28);
    const identity = wrap(`Name: ${report.technicianName}`, WIDTH, "Body", 9);
    const signedAt = wrap(`Completed: ${completedAt}`, WIDTH, "Body", 9);
    const audit = wrap(`Audit: technician ${report.technicianId} | report ${report.id} | revision ${report.revision}\nJob ID: ${report.jobId} | customer ID: ${report.customerId} | timestamp: ${report.finalizedAt}`, WIDTH, "Body", 7);
    const signatureHeight = 52 + signatureLines.length * 42 + (identity.length + signedAt.length + audit.length) * 14;
    if (signatureHeight > BOTTOM - TOP) throw new Error("Technician identity is too long for the signature block; no signature text was truncated.");
    ensure(signatureHeight);
    heading("Technician electronic signature");
    for (const text of signatureLines) { line(text, LEFT, y, "Signature", 28, colors.accent); y += 42; }
    for (const text of identity) { line(text, LEFT, y); y += 14; }
    for (const text of signedAt) { line(text, LEFT, y); y += 14; }
    for (const text of audit) { line(text, LEFT, y, "Body", 7, colors.muted); y += 14; }

    if (Object.keys(report.data.photoExceptions).length) {
      heading("Documented photo exceptions");
      for (const slot of template.photoSlots) if (report.data.photoExceptions[slot.id]) row(`${slot.label} (${slot.id})`, report.data.photoExceptions[slot.id]);
    }
    for (let index = 0; index < assets.length; index++) {
      const photo = assets[index];
      const picture = images[index];
      page();
      heading(`Photo appendix - ${index + 1} of ${assets.length}`);
      const slot = template.photoSlots.find((s) => s.id === photo.slotId)!;
      paragraph(slot.label, "Bold", 11);
      row("Photo ID / slot", `${photo.id} / ${photo.slotId}`);
      ensure(345);
      const height = 325;
      const scale = Math.min(WIDTH / picture.width, height / picture.height);
      const width = picture.width * scale;
      const imageHeight = picture.height * scale;
      doc.image(new Uint8Array(picture.bytes).buffer, LEFT + (WIDTH - width) / 2, y, { width, height: imageHeight });
      y += imageHeight + 14;
      paragraph(photo.caption || "No caption recorded.");
    }
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      doc.switchToPage(index);
      doc.moveTo(LEFT, 749).lineTo(LEFT + WIDTH, 749).lineWidth(0.5).strokeColor(colors.line).stroke();
      line(`${publicLabel} | Revision ${report.revision} | Template v1`, LEFT, 760, "Body", 8, colors.muted);
      line(`Page ${index + 1} of ${range.count}`, LEFT + WIDTH - 78, 760, "Body", 8, colors.muted);
    }
    doc.end();
    return await result;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}
