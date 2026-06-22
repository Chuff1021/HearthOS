import { NextRequest, NextResponse } from "next/server";
import { db, customers, inventoryItems, invoiceLineItems, invoices as dbInvoices } from "@/db";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { getOrCreateDefaultOrg } from "@/lib/org";
import {
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getDashboardStats,
} from "@/lib/data-store";
import { addAuditLog } from "@/lib/audit-log-store";
import { appendMemoryEvent } from "@/lib/long-term-memory";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const customerId = searchParams.get("customerId");
    const stats = searchParams.get("stats");
    const limit = Math.min(1000, Math.max(20, parseInt(searchParams.get("limit") || "500", 10)));

    if (stats === "true") {
      return NextResponse.json(await getDashboardStats());
    }

    const org = await getOrCreateDefaultOrg();
    const where = [eq(dbInvoices.orgId, org.id)];
    if (id) where.push(or(eq(dbInvoices.id, id), eq(dbInvoices.qbInvoiceId, id))!);
    if (customerId) {
      where.push(eq(dbInvoices.customerId, customerId));
    }

    const headerRows = await db
      .select({
        invoice: dbInvoices,
        customerFirst: customers.firstName,
        customerLast: customers.lastName,
        customerCompany: customers.companyName,
        qbCustomerId: customers.qbCustomerId,
      })
      .from(dbInvoices)
      .leftJoin(customers, eq(customers.id, dbInvoices.customerId))
      .where(and(...where))
      .orderBy(desc(dbInvoices.issueDate), desc(dbInvoices.updatedAt))
      .limit(id ? 1 : limit);

    if (id && headerRows.length === 0) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const invoiceIds = headerRows.map((row) => row.invoice.id);
    const lineRows = invoiceIds.length
      ? await db
          .select({
            invoiceId: invoiceLineItems.invoiceId,
            id: invoiceLineItems.id,
            qbItemId: invoiceLineItems.qbItemId,
            description: invoiceLineItems.description,
            quantity: invoiceLineItems.quantity,
            unitPrice: invoiceLineItems.unitPrice,
            total: invoiceLineItems.total,
            order: invoiceLineItems.order,
            itemName: inventoryItems.name,
            itemSku: inventoryItems.sku,
          })
          .from(invoiceLineItems)
          .leftJoin(
            inventoryItems,
            and(eq(inventoryItems.orgId, org.id), eq(inventoryItems.qbItemId, invoiceLineItems.qbItemId)),
          )
          .where(inArray(invoiceLineItems.invoiceId, invoiceIds))
          .orderBy(asc(invoiceLineItems.order))
      : [];

    const linesByInvoice = new Map<string, any[]>();
    for (const line of lineRows) {
      const lines = linesByInvoice.get(line.invoiceId) || [];
      lines.push({
        id: line.id,
        description: line.description || line.itemName || line.itemSku || "Item",
        itemId: line.qbItemId || undefined,
        itemName: line.itemName || undefined,
        partNumber: line.itemSku || line.itemName || undefined,
        qty: Number(line.quantity ?? 1),
        unitPrice: Number(line.unitPrice ?? 0),
        total: Number(line.total ?? 0),
      });
      linesByInvoice.set(line.invoiceId, lines);
    }

    const shaped = headerRows.map((row) => {
      const invoice = row.invoice;
      const customerName = row.customerCompany || [row.customerFirst, row.customerLast].filter(Boolean).join(" ").trim() || "Unknown Customer";
      const lineItems = linesByInvoice.get(invoice.id) || [];
      return {
        id: invoice.qbInvoiceId || invoice.id,
        localId: invoice.id,
        invoiceNumber: invoice.invoiceNumber?.replace(/^QB-/i, "") || invoice.qbInvoiceId || invoice.id,
        customerId: row.qbCustomerId || invoice.customerId,
        customerName,
        jobTitle: lineItems[0]?.description || "Invoice",
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate || invoice.issueDate,
        status: invoice.status || "sent",
        subtotal: Number(invoice.subtotal ?? 0),
        taxRate: Number(invoice.subtotal ?? 0) > 0 ? (Number(invoice.taxAmount ?? 0) / Number(invoice.subtotal ?? 0)) * 100 : 0,
        taxAmount: Number(invoice.taxAmount ?? 0),
        totalAmount: Number(invoice.totalAmount ?? 0),
        balance: Number(invoice.balance ?? 0),
        lineItems,
        notes: invoice.notes || undefined,
        createdAt: invoice.createdAt?.toISOString?.() || String(invoice.createdAt || ""),
        updatedAt: invoice.updatedAt?.toISOString?.() || String(invoice.updatedAt || ""),
      };
    });

    if (id) return NextResponse.json({ invoice: shaped[0] });
    if (customerId) return NextResponse.json({ invoices: shaped, total: shaped.length });
    return NextResponse.json({ invoices: shaped, total: shaped.length });
  } catch (err) {
    console.error("Failed to get invoices:", err);
    return NextResponse.json({ error: "Failed to get invoices" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.customerName || !body.jobTitle || !body.lineItems?.length) {
      return NextResponse.json(
        { error: "customerName, jobTitle, and lineItems are required" },
        { status: 400 }
      );
    }

    const subtotal = body.lineItems.reduce((sum: number, li: { total: number }) => sum + li.total, 0);
    const taxRate = body.taxRate ?? 8;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    const invoice = await createInvoice({
      customerId: body.customerId || "",
      customerName: body.customerName,
      jobNumber: body.jobNumber,
      jobTitle: body.jobTitle,
      issueDate: body.issueDate || new Date().toISOString().split("T")[0],
      dueDate: body.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      status: body.status || "draft",
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      balance: totalAmount,
      lineItems: body.lineItems.map((li: { description: string; qty: number; unitPrice: number; total: number }, idx: number) => ({
        id: `li-new-${idx}`,
        description: li.description,
        qty: li.qty,
        unitPrice: li.unitPrice,
        total: li.total,
      })),
      notes: body.notes,
    });

    addAuditLog({
      entityType: "invoice",
      entityId: invoice.id,
      action: "create",
      actor: "system",
      source: "api",
      after: invoice,
    });

    appendMemoryEvent({
      entity: "invoice",
      action: "create",
      entityId: invoice.id,
      summary: `Invoice created: ${invoice.invoiceNumber} for ${invoice.customerName}`,
      payload: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount },
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    console.error("Failed to create invoice:", err);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const before = await getInvoiceById(body.id);
    const invoice = await updateInvoice(body.id, body);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    addAuditLog({
      entityType: "invoice",
      entityId: invoice.id,
      action: "update",
      actor: "system",
      source: "api",
      before,
      after: invoice,
    });

    appendMemoryEvent({
      entity: "invoice",
      action: "update",
      entityId: invoice.id,
      summary: `Invoice updated: ${invoice.invoiceNumber}`,
      payload: { updates: body },
    });

    return NextResponse.json({ invoice });
  } catch (err) {
    console.error("Failed to update invoice:", err);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const before = await getInvoiceById(id);
    const deleted = await deleteInvoice(id);
    if (!deleted) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    addAuditLog({
      entityType: "invoice",
      entityId: id,
      action: "delete",
      actor: "system",
      source: "api",
      before,
    });

    appendMemoryEvent({
      entity: "invoice",
      action: "delete",
      entityId: id,
      summary: `Invoice deleted: ${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete invoice:", err);
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}
