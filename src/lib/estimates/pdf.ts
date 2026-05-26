const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as typeof import("pdfkit");

type EstimatePdfInput = {
  estimate: any;
  customer?: any;
};

const COMPANY = {
  name: "AARON'S FIREPLACE CO, LLC",
  address1: "611 E HARRISON ST",
  address2: "REPUBLIC, MO 65738",
  phone: "+14177329775",
  email: "aaronsfireplaceco@yahoo.com",
};

function money(value: number | undefined, currency = false) {
  const formatted = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `$${formatted}` : formatted;
}

function date(value: string | undefined) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function cleanDocumentNumber(value: string | undefined) {
  return value?.replace(/^QB-/i, "") || "";
}

function addressLines(addr: any) {
  if (!addr) return [];
  const cityLine = [addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(", ");
  return [addr.Line1, addr.Line2, addr.Line3, addr.Line4, addr.Line5, cityLine].filter(Boolean) as string[];
}

function estimateLines(estimate: any) {
  return (estimate.Line || []).filter((line: any) => line.DetailType === "SalesItemLineDetail" || line.DetailType === "DescriptionOnly" || line.SalesItemLineDetail);
}

function lineProduct(line: any) {
  const itemName = line.SalesItemLineDetail?.ItemRef?.name?.trim();
  if (itemName) return itemName;
  const first = line.Description?.split(/\r?\n/)[0]?.trim();
  return first || "Item";
}

function lineDescription(line: any) {
  const product = lineProduct(line).trim();
  const description = (line.Description || "").trim();
  if (!description) return "";
  const [first, ...rest] = description.split(/\r?\n/);
  const firstLine = first.trim();
  const normalizedProduct = product.toLowerCase();
  if (firstLine.toLowerCase() === normalizedProduct) return rest.join("\n").trim();
  if (firstLine.toLowerCase().startsWith(`${normalizedProduct} - `)) {
    return [firstLine.slice(product.length + 3).trim(), ...rest].filter(Boolean).join("\n").trim();
  }
  return description;
}

function lineQty(line: any) {
  return Number(line.SalesItemLineDetail?.Qty || 1);
}

function lineRate(line: any) {
  const qty = lineQty(line);
  return Number(line.SalesItemLineDetail?.UnitPrice ?? (qty ? Number(line.Amount || 0) / qty : Number(line.Amount || 0)));
}

function drawFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(8).fillColor("#8a8f98")
      .text(`Page ${i + 1 - range.start} of ${range.count}`, 0, doc.page.height - 34, { align: "center" });
  }
}

export function renderEstimatePdf(input: EstimatePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const estimate = input.estimate;
    const customer = input.customer || {};
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageWidth = right - left;
    const muted = "#8a8f98";
    const dark = "#111111";

    doc.font("Helvetica-Bold").fontSize(14).fillColor(dark).text(COMPANY.name, left + 8, 48);
    doc.font("Helvetica").fontSize(9.5)
      .text(COMPANY.address1, left + 8, 74)
      .text(COMPANY.address2, left + 8, 90)
      .text(COMPANY.phone, left + 8, 106)
      .text(COMPANY.email, left + 8, 122);

    doc.fontSize(18).fillColor("#666666").text("ESTIMATE", left + 8, 174);

    const metaTop = 212;
    doc.font("Helvetica").fontSize(10.5).fillColor(muted).text("BILL TO", left + 8, metaTop);
    doc.font("Helvetica").fontSize(10.5).fillColor(dark).text(estimate.CustomerRef?.name || customer.DisplayName || "Customer", left + 8, metaTop + 17);
    let billY = metaTop + 34;
    for (const line of addressLines(estimate.BillAddr || customer.BillAddr || customer.ShipAddr)) {
      doc.text(line, left + 8, billY);
      billY += 16;
    }
    const customerPhone = customer.PrimaryPhone?.FreeFormNumber || customer.AlternatePhone?.FreeFormNumber;
    if (customerPhone) {
      doc.text(customerPhone, left + 8, billY);
      billY += 16;
    }
    if (estimate.BillEmail?.Address) doc.text(estimate.BillEmail.Address, left + 8, billY);

    const metaX = right - 244;
    const metaValueX = right - 112;
    [
      ["ESTIMATE", cleanDocumentNumber(estimate.DocNumber) || estimate.Id],
      ["DATE", date(estimate.TxnDate)],
      ["EXPIRATION", date(estimate.ExpirationDate)],
      ["STATUS", estimate.TxnStatus || estimate.EmailStatus || ""],
    ].forEach(([label, value], idx) => {
      const y = metaTop + idx * 17;
      doc.font("Helvetica").fontSize(10.5).fillColor(muted).text(label, metaX, y, { width: 100 });
      doc.fillColor(dark).text(value, metaValueX, y, { width: 112 });
    });

    const tableTop = 302;
    const productX = left + 8;
    const qtyX = right - 210;
    const rateX = right - 132;
    const amountX = right - 76;

    function drawTableHeader(y: number) {
      doc.rect(left + 8, y, pageWidth - 16, 26).fill("#dedede");
      doc.font("Helvetica").fontSize(10).fillColor("#666666")
        .text("PRODUCT", productX + 4, y + 8)
        .text("QTY", qtyX, y + 8, { width: 44, align: "right" })
        .text("RATE", rateX, y + 8, { width: 62, align: "right" })
        .text("AMOUNT", amountX, y + 8, { width: 72, align: "right" });
    }

    drawTableHeader(tableTop);
    let y = tableTop + 42;
    for (const line of estimateLines(estimate)) {
      const product = lineProduct(line);
      const description = lineDescription(line);
      const qty = lineQty(line);
      const rate = lineRate(line);
      const amount = Number(line.Amount || qty * rate || 0);
      const productHeight = doc.heightOfString(product, { width: pageWidth - 245 });
      const descriptionHeight = description ? doc.heightOfString(description, { width: pageWidth - 245 }) : 0;
      const rowHeight = Math.max(42, productHeight + descriptionHeight + 20);

      if (y + rowHeight > 688) {
        doc.addPage();
        y = 48;
        drawTableHeader(y);
        y += 42;
      }

      doc.font("Helvetica").fontSize(11.5).fillColor(dark).text(product, productX + 4, y, { width: pageWidth - 245 });
      if (description) doc.fontSize(10).text(description, productX + 4, y + productHeight + 5, { width: pageWidth - 245 });
      doc.fontSize(11).text(qty ? String(qty) : "", qtyX, y, { width: 44, align: "right" });
      doc.text(qty ? money(rate) : "", rateX, y, { width: 62, align: "right" });
      doc.text(money(amount), amountX, y, { width: 72, align: "right" });
      y += rowHeight;
    }

    if (y > 640) {
      doc.addPage();
      y = 58;
    }

    const ruleY = y + 4;
    doc.moveTo(left + 8, ruleY).lineTo(right - 8, ruleY).dash(3, { space: 3 }).strokeColor("#b8bec8").stroke().undash();
    const totalsTop = ruleY + 24;
    const totalsX = right - 300;
    const totalsValueX = right - 98;
    const subtotal = estimateLines(estimate).reduce((sum: number, line: any) => sum + Number(line.Amount || 0), 0);
    const tax = Number(estimate.TxnTaxDetail?.TotalTax || 0);
    const total = Number(estimate.TotalAmt || subtotal + tax || 0);

    doc.font("Helvetica").fontSize(10).fillColor(muted).text("Thank You, We appreciate your business.", left + 8, totalsTop);
    [
      ["SUBTOTAL", money(subtotal)],
      [`TAX${tax ? "" : " (0%)"}`, money(tax)],
      ["TOTAL", money(total, true)],
    ].forEach(([label, value], idx) => {
      const rowY = totalsTop + idx * 24;
      doc.font("Helvetica").fontSize(11).fillColor(muted).text(label, totalsX, rowY);
      doc.fillColor(dark).text(value, totalsValueX, rowY, { width: 90, align: "right" });
    });

    drawFooter(doc);
    doc.end();
  });
}
