import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { serviceReportFont } from "../../src/lib/service-reports/pdf-assets";
import { verifyServiceReportPdf } from "../../src/lib/service-reports/verification";

test("service report fonts use traced filesystem paths, never a Turbopack module resolver", () => {
  for (const face of ["Regular", "SemiBold"] as const) assert.ok(serviceReportFont(face).length > 1000);
  for (const file of ["pdf-assets.ts", "pdf.ts", "gas-pdf.ts"]) {
    assert.doesNotMatch(readFileSync(`src/lib/service-reports/${file}`, "utf8"), /require\.resolve\(/);
  }
});

test("synthetic runtime check renders original gas master, embedded fonts, signature and image appendix", async () => {
  const bytes = await verifyServiceReportPdf();
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 4);
  assert.equal(pdf.getTitle(), "Aaron's Fireplace Company - Completed Gas Diagnostic Checklist");
  const photoPage = pdf.getPages().at(-1)!;
  assert.ok(photoPage.node.Resources()?.get(pdf.context.obj("XObject")), "Photo appendix contains an embedded image");
});
