import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodoStats,
  type Todo,
} from "@/lib/todos";
import { getOrCreateDefaultOrg } from "@/lib/org";
import { isClerkConfigured } from "@/lib/auth";

type RequestContext = {
  orgId: string;
  userId: string;
  userName: string;
};

async function getRequestContext(body?: Record<string, unknown>): Promise<RequestContext> {
  const fallbackOrg = await getOrCreateDefaultOrg();

  if (!isClerkConfigured()) {
    return {
      orgId: fallbackOrg.id,
      userId: "system",
      userName: (body?.createdByName as string | undefined) || "Admin",
    };
  }

  const session = await auth();
  return {
    orgId: session.orgId || fallbackOrg.id,
    userId: session.userId || "system",
    userName: (body?.createdByName as string | undefined) || "Admin",
  };
}

// GET - Get todos with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const context = await getRequestContext();

    const filters = {
      status: (searchParams.get("status") as Todo["status"]) || undefined,
      priority: (searchParams.get("priority") as Todo["priority"]) || undefined,
      assignedTo: searchParams.get("assignedTo") || undefined,
      relatedJobId: searchParams.get("jobId") || undefined,
      relatedCustomerId: searchParams.get("customerId") || undefined,
      overdue: searchParams.get("overdue") === "true" ? true : undefined,
    };

    if (searchParams.get("stats") === "true") {
      const stats = await getTodoStats(context);
      return NextResponse.json(stats);
    }

    const id = searchParams.get("id");
    if (id) {
      const todo = await getTodoById(context, id);
      if (!todo) {
        return NextResponse.json({ error: "Todo not found" }, { status: 404 });
      }
      return NextResponse.json(todo);
    }

    const todos = await getTodos(context, filters);
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
    const context = await getRequestContext(body);

    const newTodo = await createTodo(context, {
      title: body.title,
      description: body.description,
      priority: body.priority || "medium",
      status: body.status || "pending",
      dueDate: body.dueDate,
      relatedJobId: body.relatedJobId,
      relatedJobNumber: body.relatedJobNumber,
      relatedCustomerId: body.relatedCustomerId,
      relatedCustomerName: body.relatedCustomerName,
      assignedTo: body.assignedTo,
      assignedToName: body.assignedToName,
      createdBy: body.createdBy || context.userId,
      createdByName: body.createdByName || context.userName,
      tags: body.tags || [],
      completedAt: undefined,
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
    const context = await getRequestContext(body);
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Todo ID required" }, { status: 400 });
    }

    const updated = await updateTodo(context, id, updates);
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
    const context = await getRequestContext();
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Todo ID required" }, { status: 400 });
    }

    const deleted = await deleteTodo(context, id);
    if (!deleted) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete todo:", err);
    return NextResponse.json({ error: "Failed to delete todo" }, { status: 500 });
  }
}
