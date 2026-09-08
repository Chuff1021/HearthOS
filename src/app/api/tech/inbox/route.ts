import { authorizeCrmApi, requireCrmActor } from "@/lib/security/crm-access";
import { isAssignedTodo } from "@/lib/security/access-policy";
import { NextResponse } from "next/server";
import { getTodos } from "@/lib/todos";

export async function GET() {
  const accessDenied = await authorizeCrmApi("/api/tech/inbox", "GET");
  if (accessDenied) return accessDenied;
  try {
    const actor = await requireCrmActor();
    const todos = (await getTodos()).filter((todo) => isAssignedTodo(actor, todo));
    return NextResponse.json({
      tech: { id: actor.employeeId, name: actor.name, email: actor.email },
      todos,
      total: todos.length,
      callbackCount: todos.filter((todo) => /call back/i.test(todo.title) || !!todo.relatedCustomerPhone).length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load tech inbox" }, { status: 500 });
  }
}
