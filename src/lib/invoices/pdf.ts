const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as typeof import("pdfkit");

import type { QBInvoice, QBInvoiceLine } from "@/lib/quickbooks/types";

type InvoicePdfInput = {
  invoice: QBInvoice;
  paymentUrl?: string;
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

function addressLines(addr: QBInvoice["BillAddr"] | QBInvoice["ShipAddr"] | any) {
  if (!addr) return [];
  const cityLine = [addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(", ");
  return [addr.Line1, addr.Line2, addr.Line3, addr.Line4, addr.Line5, cityLine].filter(Boolean) as string[];
}

function invoiceLines(invoice: QBInvoice) {
  return (invoice.Line || []).filter((line) => line.DetailType === "SalesItemLineDetail" || line.DetailType === "DescriptionOnly");
}

function normalizeLookup(value: string | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPartNumber(description: string | undefined) {
  const text = (description || "").trim();
  const partLine = text.match(/\n\s*Part:\s*([^\n]+)/i);
  if (partLine?.[1]) return partLine[1].trim();
  const prefix = text.match(/^([A-Z0-9][A-Z0-9:._/-]{2,})\s+-\s+/i);
  return prefix?.[1]?.trim() || "";
}

function cleanLineDescription(description: string | undefined, product: string | undefined) {
  let cleaned = (description || "").replace(/\n\s*Part:\s*.+$/i, "").trim();
  const productText = (product || "").trim();
  if (!productText) return cleaned;
  return cleaned
    .replace(new RegExp(`^${escapeRegExp(productText)}\\s*-\\s*`, "i"), "")
    .replace(new RegExp(`\\s*\\(${escapeRegExp(productText)}\\)\\s*$`, "i"), "")
    .trim();
}

function lineProduct(line: QBInvoiceLine) {
  const description = (line.Description || "").trim();
  const partNumber = extractPartNumber(description);
  const itemName = line.SalesItemLineDetail?.ItemRef?.name?.trim();
  const product = partNumber || itemName || description.split(/\r?\n/)[0]?.trim() || "Item";
  const cleanedDescription = cleanLineDescription(description, product);
  if (cleanedDescription && !normalizeLookup(cleanedDescription).includes(normalizeLookup(product))) {
    return `${product} - ${cleanedDescription}`;
  }
  return product;
}

function lineDescription(line: QBInvoiceLine) {
  const product = lineProduct(line).trim();
  const description = (line.Description || "").trim();
  if (!description) return "";
  const cleanedDescription = cleanLineDescription(description, extractPartNumber(description) || line.SalesItemLineDetail?.ItemRef?.name);
  return normalizeLookup(lineProduct(line)).includes(normalizeLookup(cleanedDescription)) ? "" : cleanedDescription;
}

function lineQty(line: QBInvoiceLine) {
  return Number(line.SalesItemLineDetail?.Qty || 1);
}

function lineRate(line: QBInvoiceLine) {
  const qty = lineQty(line);
  return Number(line.SalesItemLineDetail?.UnitPrice ?? (qty ? Number(line.Amount || 0) / qty : Number(line.Amount || 0)));
}

function isTaxable(line: QBInvoiceLine) {
  const value = line.SalesItemLineDetail?.TaxCodeRef?.value;
  return Boolean(value && !/^non|nontax/i.test(value));
}

function drawFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(8).fillColor("#8a8f98")
      .text(`Page ${i + 1 - range.start} of ${range.count}`, 0, doc.page.height - 34, { align: "center" });
  }
}

export function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const invoice = input.invoice;
    const customer = input.customer || {};
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageWidth = right - left;
    const muted = "#8a8f98";
    const dark = "#111111";
    const headerFill = "#dedede";
    const accent = "#f8971f";

    doc.font("Helvetica-Bold").fontSize(14).fillColor(dark).text(COMPANY.name, left + 8, 48);
    doc.font("Helvetica").fontSize(9.5)
      .text(COMPANY.address1, left + 8, 74)
      .text(COMPANY.address2, left + 8, 90)
      .text(COMPANY.phone, left + 8, 106)
      .text(COMPANY.email, left + 8, 122);

    doc.fontSize(18).fillColor("#666666").text("INVOICE", left + 8, 174);

    const metaTop = 212;
    doc.font("Helvetica").fontSize(10.5).fillColor(muted).text("BILL TO", left + 8, metaTop);
    doc.font("Helvetica").fontSize(10.5).fillColor(dark).text(invoice.CustomerRef?.name || customer.DisplayName || "Customer", left + 8, metaTop + 17);
    let billY = metaTop + 34;
    for (const line of addressLines(invoice.BillAddr || customer.BillAddr || customer.ShipAddr)) {
      doc.text(line, left + 8, billY);
      billY += 16;
    }
    const customerPhone = customer.PrimaryPhone?.FreeFormNumber || customer.AlternatePhone?.FreeFormNumber;
    if (customerPhone) {
      doc.text(customerPhone, left + 8, billY);
      billY += 16;
    }
    if (invoice.BillEmail?.Address) {
      doc.text(invoice.BillEmail.Address, left + 8, billY);
    }

    const termsName = (invoice as any).SalesTermRef?.name || "Due on receipt";
    const metaX = right - 244;
    const metaValueX = right - 112;
    const meta = [
      ["INVOICE", cleanDocumentNumber(invoice.DocNumber) || invoice.Id],
      ["DATE", date(invoice.TxnDate)],
      ["TERMS", termsName],
      ["DUE DATE", date(invoice.DueDate || invoice.TxnDate)],
    ];
    meta.forEach(([label, value], idx) => {
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
      doc.rect(left + 8, y, pageWidth - 16, 26).fill(headerFill);
      doc.font("Helvetica").fontSize(10).fillColor("#666666")
        .text("PRODUCT", productX + 4, y + 8)
        .text("QTY", qtyX, y + 8, { width: 44, align: "right" })
        .text("RATE", rateX, y + 8, { width: 62, align: "right" })
        .text("AMOUNT", amountX, y + 8, { width: 72, align: "right" });
    }

    drawTableHeader(tableTop);

    let y = tableTop + 42;
    for (const line of invoiceLines(invoice)) {
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
      if (description) {
        doc.fontSize(10).text(description, productX + 4, y + productHeight + 5, { width: pageWidth - 245 });
      }
      doc.fontSize(11).text(qty ? String(qty) : "", qtyX, y, { width: 44, align: "right" });
      doc.text(qty ? money(rate) : "", rateX, y, { width: 62, align: "right" });
      doc.text(`${money(amount)}${isTaxable(line) ? "T" : ""}`, amountX, y, { width: 72, align: "right" });
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
    const taxRate = Number(invoice.TxnTaxDetail?.TotalTax || 0) > 0 && Number(invoice.TotalAmt || 0) > 0
      ? ""
      : " (0%)";
    const subtotal = invoiceLines(invoice).reduce((sum, line) => sum + Number(line.Amount || 0), 0);
    const tax = Number(invoice.TxnTaxDetail?.TotalTax || 0);
    const total = Number(invoice.TotalAmt || subtotal + tax || 0);
    const balance = Number(invoice.Balance ?? total);

    doc.font("Helvetica").fontSize(10).fillColor(muted)
      .text("Thank You, We appreciate your business.", left + 8, totalsTop);
    if (input.paymentUrl && balance > 0) {
      doc.font("Helvetica-Bold").fillColor(accent).text("Pay online", left + 8, totalsTop + 24, {
        link: input.paymentUrl,
        underline: true,
      });
    }

    const totalRows = [
      [`SUBTOTAL`, money(subtotal)],
      [`TAX${taxRate}`, money(tax)],
      [`TOTAL`, money(total)],
    ];
    totalRows.forEach(([label, value], idx) => {
      const rowY = totalsTop + idx * 24;
      doc.font("Helvetica").fontSize(11).fillColor(muted).text(label, totalsX, rowY);
      doc.fillColor(dark).text(value, totalsValueX, rowY, { width: 90, align: "right" });
    });

    const balanceY = totalsTop + 90;
    doc.moveTo(totalsX - 6, balanceY - 14).lineTo(right - 8, balanceY - 14).dash(3, { space: 3 }).strokeColor("#b8bec8").stroke().undash();
    doc.font("Helvetica").fontSize(11).fillColor(muted).text("BALANCE DUE", totalsX, balanceY);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(dark).text(money(balance, true), totalsValueX - 42, balanceY - 2, { width: 132, align: "right" });

    drawFooter(doc);
    doc.end();
  });
}
