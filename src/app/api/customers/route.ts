import { NextRequest, NextResponse } from "next/server";
import {
  getCustomers,
  getCustomerById,
  searchCustomersLocal,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/data-store";
import { appendMemoryEvent } from "@/lib/long-term-memory";
import { requirePermission, tenantErrorResponse } from "@/lib/tenant/context";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("customers:read");
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const id = searchParams.get("id");

    if (id) {
      const customer = await getCustomerById(id);
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
      return NextResponse.json({ customer });
    }

    if (query) {
      const results = await searchCustomersLocal(query);
      return NextResponse.json({ customers: results, total: results.length });
    }

    const customers = await getCustomers();
    return NextResponse.json({ customers, total: customers.length });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    console.error("Failed to get customers:", err);
    return NextResponse.json({ error: "Failed to get customers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("customers:write");
    const body = await request.json();
    
    if (!body.displayName || !body.firstName || !body.lastName) {
      return NextResponse.json(
        { error: "displayName, firstName, and lastName are required" },
        { status: 400 }
      );
    }

    const customer = await createCustomer({
      displayName: body.displayName,
      firstName: body.firstName,
      lastName: body.lastName,
      companyName: body.companyName,
      email: body.email,
      phone: body.phone,
      address: body.address,
      active: body.active ?? true,
      tags: body.tags || [],
      notes: body.notes,
    });

    await appendMemoryEvent({
      entity: "customer",
      action: "create",
      entityId: customer.id,
      summary: `Customer created: ${customer.displayName}`,
      payload: { customer },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    console.error("Failed to create customer:", err);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePermission("customers:write");
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const customer = await updateCustomer(body.id, body);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    await appendMemoryEvent({
      entity: "customer",
      action: "update",
      entityId: customer.id,
      summary: `Customer updated: ${customer.displayName}`,
      payload: { updates: body },
    });

    return NextResponse.json({ customer });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    console.error("Failed to update customer:", err);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requirePermission("customers:write");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const deleted = await deleteCustomer(id);
    if (!deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    await appendMemoryEvent({
      entity: "customer",
      action: "delete",
      entityId: id,
      summary: `Customer deleted: ${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const tenantResponse = tenantErrorResponse(err);
    if (tenantResponse) return tenantResponse;
    console.error("Failed to delete customer:", err);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
