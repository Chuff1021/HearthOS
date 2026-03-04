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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const id = searchParams.get("id");

    if (id) {
      const customer = getCustomerById(id);
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
      return NextResponse.json({ customer });
    }

    if (query) {
      const results = searchCustomersLocal(query);
      return NextResponse.json({ customers: results, total: results.length });
    }

    const customers = getCustomers();
    return NextResponse.json({ customers, total: customers.length });
  } catch (err) {
    console.error("Failed to get customers:", err);
    return NextResponse.json({ error: "Failed to get customers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.displayName || !body.firstName || !body.lastName) {
      return NextResponse.json(
        { error: "displayName, firstName, and lastName are required" },
        { status: 400 }
      );
    }

    const customer = createCustomer({
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

    appendMemoryEvent({
      entity: "customer",
      action: "create",
      entityId: customer.id,
      summary: `Customer created: ${customer.displayName}`,
      payload: { customer },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    console.error("Failed to create customer:", err);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const customer = updateCustomer(body.id, body);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    appendMemoryEvent({
      entity: "customer",
      action: "update",
      entityId: customer.id,
      summary: `Customer updated: ${customer.displayName}`,
      payload: { updates: body },
    });

    return NextResponse.json({ customer });
  } catch (err) {
    console.error("Failed to update customer:", err);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const deleted = deleteCustomer(id);
    if (!deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    appendMemoryEvent({
      entity: "customer",
      action: "delete",
      entityId: id,
      summary: `Customer deleted: ${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete customer:", err);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
