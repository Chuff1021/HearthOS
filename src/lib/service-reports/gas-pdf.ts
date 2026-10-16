import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ReportSnapshot } from "./domain";
import { gasChecks } from "./gas-template";

/** Fill the supplied master, retaining both original pages. Full answers and
 * authorized photos follow in the immutable report appendix, never clipped. */
export async function attachGasChecklist(report: ReportSnapshot, appendix: Buffer): Promise<Buffer> {
  const pdf = await PDFDocument.load(readFileSync(path.join(process.cwd(), "src/assets/service-forms/aarons-gas-diagnostic-v2.pdf")));
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(path.join(path.dirname(require.resolve("geist/font/sans")), "fonts/geist-sans/Geist-Regular.ttf")), { subset: true });
  const page = pdf.getPage(0);
  const a = report.data.answers;
  const ink = rgb(0.08, 0.17, 0.25);
  // Coordinates use the master's top-left origin in PDF points. An overfull
  // entry links to its complete value in the appended report rather than shrinking illegibly.
  function put(value: string | undefined, x: number, top: number, width: number, size = 7) {
    if (!value?.trim()) return;
    let line = value.replace(/\s+/g, " ").trim();
    if (font.widthOfTextAtSize(line, size) > width) line = "See report details";
    if (font.widthOfTextAtSize(line, size) > width) line = "Details*";
    page.drawText(line, { x, y: 792 - top - size, size, font, color: ink });
  }
  function mark(x: number, top: number, yes: boolean) { if (yes) put("X", x, top, 10, 7); }
  function blank(value: string | undefined, x: number, top: number, width: number, gray = false) {
    if (!value?.trim()) return;
    page.drawRectangle({ x, y: 792 - top - 8, width, height: 8, color: gray ? rgb(0.92,0.92,0.93) : rgb(1,1,1) });
    put(value, x + 1, top, width - 2, 6.5);
  }
  put(report.serviceDate, 53, 122, 238);
  put(report.jobNumber, 53, 145, 238);
  put(a.unitMake, 53, 168, 238);
  put(a.unitModel, 53, 191, 238);
  put(a.serial, 53, 214, 238);
  put(report.customerName, 298, 122, 260);
  put(a.customerContact, 298, 145, 260);
  put(report.address, 298, 170, 260);
  // Outline the selected printed option without obscuring the original label.
  function outline(x: number, width: number, selected: boolean) {
    if (selected) page.drawRectangle({ x, y: 792 - 248, width, height: 12, borderColor: ink, borderWidth: 1.2 });
  }
  outline(88, 16, a.gasFuel === "NG"); outline(105, 15, a.gasFuel === "LP");
  outline(186, 16, a.pilotType === "IPI"); outline(205, 45, a.pilotType === "Safety pilot");
  for (const [name, x, width] of [["Fireplace",360,40],["Stove",402,27],["Insert",431,28],["Log set",460,33]] as const) outline(x, width, a.applianceType === name);
  const rowTops = [276, 296, 321, 335, 373, 402, 414, 425, 437, 448, 459, 485, 502, 515, 544];
  gasChecks.forEach(([id], i) => {
    const status = a[id];
    if (["N", "S", "D"].includes(status)) mark(status === "N" ? 198 : status === "S" ? 235 : 273, rowTops[i], true);
    else put(status === "NA" ? "N/A" : status === "NI" ? "Not checked*" : "", 187, rowTops[i], 104, 6.5);
  });
  blank(a.coBefore, 454, 280, 31, true);
  blank(a.gasInlet, 340, 298, 28); blank(a.gasManifold, 467, 298, 40);
  mark(299, 310, a.GD02 === "NI");
  blank(a.thermopileInitial, 333, 340, 44); blank(a.thermopileDrop, 332, 348, 44);
  mark(299, 360, a.GD04 === "NI");
  blank(a.thermocouple, 363, 378, 36, true); mark(299, 391, a.GD05 === "NI");
  // The source has a scale but no fan-result blank; preserve it and put the reading in notes.
  blank(a.remoteBrand, 348, 491, 95);
  if (a.newBatteries === "Yes") put("X", 489, 484, 4, 5);
  if (a.customerBatteries === "Yes") put("X", 446.5, 492, 4, 5);
  blank(a.coAfter, 446, 521, 31);
  page.drawRectangle({ x: 184, y: 792 - 540, width: 109, height: 10, color: rgb(0.92,0.92,0.93) });
  put(report.photos.length ? `Yes: ${report.photos.length} photos attached` : "No: exceptions attached", 188, 532, 103, 6);
  mark(477, 549, a.gasLeakResult === "No leaks detected");
  put(a.workCompleted, 53, 278, 124, 7);
  put("Full findings / readings attached.", 53, 294, 124, 6.5);
  if (a.fanResistance) put(`Fan: ${a.fanResistance} megohms`, 53, 310, 124, 6.5);
  put("N/A and Not checked: see details.", 53, 326, 124, 6.5);
  put("Use model-specific criteria.", 53, 342, 124, 6.5);
  mark(53, 579, a.npr === "Yes");
  put(a.diagnosticResults, 91, 578, 465, 7);
  for (const n of [1, 2, 3, 4]) {
    const top = 616 + (n - 1) * 23;
    if (n < 4) put(a[`part${n}_description`], 53, top, 125, 6.5);
    put(a[`part${n}_number`], 184, top, 71, 6.5);
    put(a[`part${n}_warranty`], 259, top, 33, 6);
    put(a[`part${n}_cost`], 305, top, 75, 7);
    mark(401, top, a[`part${n}_decision`] === "Accept"); mark(445, top, a[`part${n}_decision`] === "Decline");
    mark(488, top, a[`part${n}_installed`] === "Yes"); mark(535, top, a[`part${n}_prepaid`] === "Yes");
  }
  put(report.data.customerAcknowledgment ? "See customer acknowledgment in attached report." : "Not captured", 53, 729, 238, 7);
  put(a.checkNumber, 297, 730, 40, 6.5); mark(358, 730, a.creditCard === "Yes");
  put(a.subtotal, 431, 715, 125, 7); put(a.tax, 416, 726, 140, 7); put(a.total, 421, 738, 135, 7);
  put(`Report ${report.id.slice(-8)} / revision ${report.revision} | Full notes, technician signature and photos follow.`, 50, 762, 512, 6.5);
  const details = await PDFDocument.load(appendix);
  for (const detail of await pdf.copyPages(details, details.getPageIndices())) pdf.addPage(detail);
  pdf.setTitle("Aaron's Fireplace Company - Completed Gas Diagnostic Checklist");
  pdf.setSubject("Recorded findings; printed guide values do not replace manufacturer specifications.");
  return Buffer.from(await pdf.save());
}
