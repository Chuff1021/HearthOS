import { NextRequest, NextResponse } from "next/server";
import {
  getInvoices,
  getInvoiceById,
  getInvoicesForCustomer,
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

    if (stats === "true") {
      return NextResponse.json(getDashboardStats());
    }

    if (id) {
      const invoice = getInvoiceById(id);
      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      return NextResponse.json({ invoice });
    }

    if (customerId) {
      const invoices = getInvoicesForCustomer(customerId);
      return NextResponse.json({ invoices, total: invoices.length });
    }

    const invoices = getInvoices();
    return NextResponse.json({ invoices, total: invoices.length });
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

    const invoice = createInvoice({
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

    const before = getInvoiceById(body.id);
    const invoice = updateInvoice(body.id, body);
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

    const before = getInvoiceById(id);
    const deleted = deleteInvoice(id);
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
