import { and, asc, desc, eq, lt, ne, sql } from "drizzle-orm";
import { db, todos } from "@/db";

export type TodoPriority = "low" | "medium" | "high" | "urgent";
export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Todo {
  id: string;
  title: string;
  description?: string;
  priority: TodoPriority;
  status: TodoStatus;
  dueDate?: string;
  relatedJobId?: string;
  relatedJobNumber?: string;
  relatedCustomerId?: string;
  relatedCustomerName?: string;
  assignedTo?: string;
  assignedToName?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  tags: string[];
}

type TodoFilters = {
  status?: TodoStatus;
  priority?: TodoPriority;
  assignedTo?: string;
  relatedJobId?: string;
  relatedCustomerId?: string;
  overdue?: boolean;
};

type TodoContext = {
  orgId: string;
  userId: string;
  userName: string;
};

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapTodo(row: typeof todos.$inferSelect): Todo {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority,
    status: row.status,
    dueDate: row.dueDate ?? undefined,
    relatedJobId: row.relatedJobId ?? undefined,
    relatedJobNumber: row.relatedJobNumber ?? undefined,
    relatedCustomerId: row.relatedCustomerId ?? undefined,
    relatedCustomerName: row.relatedCustomerName ?? undefined,
    assignedTo: row.assignedTo ?? undefined,
    assignedToName: row.assignedToName ?? undefined,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    completedAt: toIso(row.completedAt),
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

export async function getTodos(context: TodoContext, filters?: TodoFilters): Promise<Todo[]> {
  const conditions = [eq(todos.orgId, context.orgId)];

  if (filters?.status) conditions.push(eq(todos.status, filters.status));
  if (filters?.priority) conditions.push(eq(todos.priority, filters.priority));
  if (filters?.assignedTo) conditions.push(eq(todos.assignedTo, filters.assignedTo));
  if (filters?.relatedJobId) conditions.push(eq(todos.relatedJobId, filters.relatedJobId));
  if (filters?.relatedCustomerId) {
    conditions.push(eq(todos.relatedCustomerId, filters.relatedCustomerId));
  }

  if (filters?.overdue) {
    const today = new Date().toISOString().split("T")[0];
    conditions.push(lt(todos.dueDate, today));
    conditions.push(ne(todos.status, "completed"));
    conditions.push(ne(todos.status, "cancelled"));
  }

  const rows = await db
    .select()
    .from(todos)
    .where(and(...conditions))
    .orderBy(
      sql`CASE ${todos.priority}
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
      END`,
      asc(todos.dueDate),
      desc(todos.createdAt),
    );

  return rows.map(mapTodo);
}

export async function getTodoById(context: TodoContext, id: string): Promise<Todo | undefined> {
  const row = await db
    .select()
    .from(todos)
    .where(and(eq(todos.orgId, context.orgId), eq(todos.id, id)))
    .limit(1);

  return row[0] ? mapTodo(row[0]) : undefined;
}

export async function createTodo(
  context: TodoContext,
  todo: Omit<Todo, "id" | "createdAt" | "updatedAt">,
): Promise<Todo> {
  const now = new Date();
  const inserted = await db
    .insert(todos)
    .values({
      orgId: context.orgId,
      title: todo.title,
      description: todo.description,
      priority: todo.priority,
      status: todo.status,
      dueDate: todo.dueDate,
      relatedJobId: todo.relatedJobId,
      relatedJobNumber: todo.relatedJobNumber,
      relatedCustomerId: todo.relatedCustomerId,
      relatedCustomerName: todo.relatedCustomerName,
      assignedTo: todo.assignedTo,
      assignedToName: todo.assignedToName,
      createdBy: todo.createdBy,
      createdByName: todo.createdByName,
      completedAt: todo.status === "completed" ? now : undefined,
      tags: todo.tags ?? [],
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapTodo(inserted[0]);
}

export async function updateTodo(
  context: TodoContext,
  id: string,
  updates: Partial<Todo>,
): Promise<Todo | null> {
  const existing = await getTodoById(context, id);
  if (!existing) return null;

  const now = new Date();
  const statusUpdate = updates.status;
  const completedAt =
    statusUpdate === "completed"
      ? now
      : statusUpdate
        ? null
        : existing.completedAt
          ? new Date(existing.completedAt)
          : null;

  const [updated] = await db
    .update(todos)
    .set({
      title: updates.title,
      description: updates.description,
      priority: updates.priority,
      status: updates.status,
      dueDate: updates.dueDate,
      relatedJobId: updates.relatedJobId,
      relatedJobNumber: updates.relatedJobNumber,
      relatedCustomerId: updates.relatedCustomerId,
      relatedCustomerName: updates.relatedCustomerName,
      assignedTo: updates.assignedTo,
      assignedToName: updates.assignedToName,
      createdBy: updates.createdBy,
      createdByName: updates.createdByName,
      tags: updates.tags,
      completedAt,
      updatedAt: now,
    })
    .where(and(eq(todos.orgId, context.orgId), eq(todos.id, id)))
    .returning();

  return updated ? mapTodo(updated) : null;
}

export async function deleteTodo(context: TodoContext, id: string): Promise<boolean> {
  const deleted = await db
    .delete(todos)
    .where(and(eq(todos.orgId, context.orgId), eq(todos.id, id)))
    .returning({ id: todos.id });

  return deleted.length > 0;
}

export async function getTodoStats(context: TodoContext) {
  const rows = await db.select().from(todos).where(eq(todos.orgId, context.orgId));
  const today = new Date().toISOString().split("T")[0];

  const pending = rows.filter((t) => t.status === "pending").length;
  const inProgress = rows.filter((t) => t.status === "in_progress").length;
  const completed = rows.filter((t) => t.status === "completed").length;
  const overdue = rows.filter(
    (t) => t.dueDate && t.dueDate < today && t.status !== "completed" && t.status !== "cancelled",
  ).length;
  const dueToday = rows.filter(
    (t) => t.dueDate === today && t.status !== "completed" && t.status !== "cancelled",
  ).length;

  return {
    total: rows.length,
    pending,
    inProgress,
    completed,
    overdue,
    dueToday,
  };
}
