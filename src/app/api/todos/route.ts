import { NextRequest, NextResponse } from "next/server";
import { 
  getTodos, 
  getTodoById, 
  createTodo, 
  updateTodo, 
  deleteTodo, 
  getTodoStats,
  type Todo 
} from "@/lib/todos";

// GET - Get todos with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const filters = {
      status: searchParams.get("status") as Todo["status"] || undefined,
      priority: searchParams.get("priority") as Todo["priority"] || undefined,
      assignedTo: searchParams.get("assignedTo") || undefined,
      relatedJobId: searchParams.get("jobId") || undefined,
      relatedCustomerId: searchParams.get("customerId") || undefined,
      overdue: searchParams.get("overdue") === "true" ? true : undefined,
    };

    // If requesting stats
    if (searchParams.get("stats") === "true") {
      const stats = await getTodoStats();
      return NextResponse.json(stats);
    }

    // If requesting a specific todo
    const id = searchParams.get("id");
    if (id) {
      const todo = await getTodoById(id);
      if (!todo) {
        return NextResponse.json({ error: "Todo not found" }, { status: 404 });
      }
      return NextResponse.json(todo);
    }

    // Get filtered todos
    const todos = await getTodos(filters);
    return NextResponse.json({ todos });
  } catch (err) {
    console.error("Failed to get todos:", err);
    return NextResponse.json({ error: "Failed to get todos" }, { status: 500 });
  }
}

// POST - Create a new todo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const newTodo = await createTodo({
      title: body.title,
      description: body.description,
      priority: body.priority || "medium",
      status: body.status || "pending",
      dueDate: body.dueDate,
      relatedJobId: body.relatedJobId,
      relatedJobNumber: body.relatedJobNumber,
      relatedCustomerId: body.relatedCustomerId,
      relatedCustomerName: body.relatedCustomerName,
      relatedCustomerPhone: body.relatedCustomerPhone,
      assignedTo: body.assignedTo,
      assignedToName: body.assignedToName,
      assignedToEmail: body.assignedToEmail,
      createdBy: body.createdBy || "admin",
      createdByName: body.createdByName || "Admin",
      tags: body.tags || [],
    });

    return NextResponse.json({ todo: newTodo }, { status: 201 });
  } catch (err) {
    console.error("Failed to create todo:", err);
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
}

// PUT - Update a todo
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Todo ID required" }, { status: 400 });
    }

    const updated = await updateTodo(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    return NextResponse.json({ todo: updated });
  } catch (err) {
    console.error("Failed to update todo:", err);
    return NextResponse.json({ error: "Failed to update todo" }, { status: 500 });
  }
}

// DELETE - Delete a todo
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Todo ID required" }, { status: 400 });
    }

    const deleted = await deleteTodo(id);
    if (!deleted) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete todo:", err);
    return NextResponse.json({ error: "Failed to delete todo" }, { status: 500 });
  }
}
