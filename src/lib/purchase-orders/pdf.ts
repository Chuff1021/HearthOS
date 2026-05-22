const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as typeof import("pdfkit");

type PurchaseOrderPdfLine = {
  itemName?: string;
  partNumber?: string;
  description?: string;
  qty?: number;
  unitPrice?: number;
  amount?: number;
};

type PurchaseOrderPdfInput = {
  poNumber?: string;
  txnDate?: string;
  vendorName?: string;
  mailingAddress?: string;
  shipTo?: string;
  shippingAddress?: string;
  lines: PurchaseOrderPdfLine[];
};

function money(value: number | undefined) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function splitAddress(value: string | undefined) {
  return (value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function lineProduct(line: PurchaseOrderPdfLine) {
  const description = line.description || line.itemName || line.partNumber || "Item";
  const sku = line.partNumber || "";
  if (sku && description.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(sku.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
    return description;
  }
  return description;
}

export function renderPurchaseOrderPdf(input: PurchaseOrderPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 42 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const top = 48;
    const right = left + pageWidth;

    doc.font("Helvetica-Bold").fontSize(13).text("AARON'S FIREPLACE CO, LLC", left, top);
    doc.font("Helvetica").fontSize(9)
      .text("611 E HARRISON ST", left, top + 22)
      .text("REPUBLIC, MO  65738", left, top + 38)
      .text("+14177329775", left, top + 54)
      .text("aaronsfireplaceco@yahoo.com", left, top + 70);

    doc.fontSize(16).fillColor("#666666").text("Purchase Order", left, top + 122);
    doc.fillColor("#111111");

    const metaTop = top + 152;
    doc.font("Helvetica").fontSize(9).fillColor("#8a8f98").text("VENDOR", left, metaTop);
    doc.fillColor("#111111").fontSize(10).text(input.vendorName || "", left, metaTop + 16);
    splitAddress(input.mailingAddress).forEach((line, idx) => {
      doc.text(line, left, metaTop + 32 + idx * 15);
    });

    const shipX = left + 250;
    doc.font("Helvetica").fontSize(9).fillColor("#8a8f98").text("SHIP TO", shipX, metaTop);
    doc.fillColor("#111111").fontSize(10).text(input.shipTo || "", shipX, metaTop + 16);
    splitAddress(input.shippingAddress).forEach((line, idx) => {
      doc.text(line, shipX, metaTop + 32 + idx * 15);
    });

    const poX = right - 132;
    doc.font("Helvetica").fontSize(9).fillColor("#8a8f98").text("P.O.", poX, metaTop);
    doc.text("DATE", poX, metaTop + 18);
    doc.fillColor("#111111").fontSize(10).text(input.poNumber || "", poX + 58, metaTop);
    doc.text(input.txnDate || "", poX + 58, metaTop + 18);

    const tableTop = metaTop + 112;
    doc.rect(left, tableTop, pageWidth, 24).fill("#dedede");
    doc.fillColor("#666666").fontSize(9)
      .text("PRODUCT", left + 4, tableTop + 8)
      .text("QTY", right - 190, tableTop + 8, { width: 40, align: "right" })
      .text("RATE", right - 112, tableTop + 8, { width: 60, align: "right" })
      .text("AMOUNT", right - 66, tableTop + 8, { width: 66, align: "right" });

    let y = tableTop + 42;
    doc.fillColor("#111111").fontSize(10);
    for (const line of input.lines) {
      if (y > 680) {
        doc.addPage();
        y = 48;
      }
      const qty = Number(line.qty || 0);
      const rate = Number(line.unitPrice || 0);
      const amount = Number(line.amount || qty * rate || 0);
      const product = lineProduct(line);
      const productHeight = doc.heightOfString(product, { width: pageWidth - 235 });
      doc.text(product, left + 4, y, { width: pageWidth - 235 });
      doc.text(String(qty || ""), right - 190, y, { width: 40, align: "right" });
      doc.text(money(rate), right - 112, y, { width: 60, align: "right" });
      doc.text(money(amount), right - 66, y, { width: 66, align: "right" });
      y += Math.max(productHeight, 14) + 11;
    }

    const subtotal = input.lines.reduce((sum, line) => {
      const qty = Number(line.qty || 0);
      const rate = Number(line.unitPrice || 0);
      return sum + Number(line.amount || qty * rate || 0);
    }, 0);

    y += 10;
    doc.moveTo(left, y).lineTo(right, y).dash(3, { space: 3 }).strokeColor("#9ca3af").stroke().undash();
    y += 22;
    doc.fillColor("#8a8f98").fontSize(10).text("SUBTOTAL", right - 280, y);
    doc.fillColor("#111111").text(money(subtotal), right - 88, y, { width: 88, align: "right" });
    y += 24;
    doc.fillColor("#8a8f98").text("TOTAL", right - 280, y);
    doc.fillColor("#111111").fontSize(11).text(`$${money(subtotal)}`, right - 88, y, { width: 88, align: "right" });

    const signY = Math.max(y + 70, 705);
    doc.fillColor("#8a8f98").fontSize(9).text("Approved By", left, signY);
    doc.moveTo(left + 120, signY + 12).lineTo(right, signY + 12).strokeColor("#8a8f98").stroke();
    doc.text("Date", left, signY + 34);
    doc.moveTo(left + 120, signY + 46).lineTo(right, signY + 46).strokeColor("#8a8f98").stroke();
    doc.fontSize(8).text("Page 1 of 1", 0, doc.page.height - 34, { align: "center" });

    doc.end();
  });
}
