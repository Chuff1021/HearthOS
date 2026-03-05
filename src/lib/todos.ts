import postgres from 'postgres';

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

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
  relatedCustomerPhone?: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  tags: string[];
}

let sqlClient: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for durable todo storage');
  if (!sqlClient) {
    sqlClient = postgres(process.env.DATABASE_URL, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return sqlClient;
}

async function ensureTable() {
  const sql = getSql();
  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        create table if not exists todos_live (
          id text primary key,
          title text not null,
          description text,
          priority text not null,
          status text not null,
          due_date date,
          related_job_id text,
          related_job_number text,
          related_customer_id text,
          related_customer_name text,
          related_customer_phone text,
          assigned_to text,
          assigned_to_name text,
          assigned_to_email text,
          created_by text not null,
          created_by_name text not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          completed_at timestamptz,
          tags jsonb not null default '[]'::jsonb
        );
      `;
      await sql`create index if not exists idx_todos_live_assigned_to on todos_live (assigned_to);`;
      await sql`create index if not exists idx_todos_live_assigned_email on todos_live (assigned_to_email);`;
      await sql`create index if not exists idx_todos_live_status on todos_live (status);`;
      await sql`create index if not exists idx_todos_live_due_date on todos_live (due_date);`;
    })();
  }
  await initPromise;
}

function mapRow(r: any): Todo {
  return {
    id: r.id,
    title: r.title,
    description: r.description || undefined,
    priority: r.priority,
    status: r.status,
    dueDate: r.due_date ? new Date(r.due_date).toISOString().split('T')[0] : undefined,
    relatedJobId: r.related_job_id || undefined,
    relatedJobNumber: r.related_job_number || undefined,
    relatedCustomerId: r.related_customer_id || undefined,
    relatedCustomerName: r.related_customer_name || undefined,
    relatedCustomerPhone: r.related_customer_phone || undefined,
    assignedTo: r.assigned_to || undefined,
    assignedToName: r.assigned_to_name || undefined,
    assignedToEmail: r.assigned_to_email || undefined,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : undefined,
    tags: Array.isArray(r.tags) ? r.tags : [],
  };
}

export async function getTodos(filters?: {
  status?: TodoStatus;
  priority?: TodoPriority;
  assignedTo?: string;
  relatedJobId?: string;
  relatedCustomerId?: string;
  overdue?: boolean;
}): Promise<Todo[]> {
  const sql = getSql();
  await ensureTable();

  const rows: any[] = await sql`select * from todos_live order by updated_at desc`;
  let todos = rows.map(mapRow);

  if (filters?.status) todos = todos.filter((t) => t.status === filters.status);
  if (filters?.priority) todos = todos.filter((t) => t.priority === filters.priority);
  if (filters?.assignedTo) todos = todos.filter((t) => t.assignedTo === filters.assignedTo);
  if (filters?.relatedJobId) todos = todos.filter((t) => t.relatedJobId === filters.relatedJobId);
  if (filters?.relatedCustomerId) todos = todos.filter((t) => t.relatedCustomerId === filters.relatedCustomerId);
  if (filters?.overdue) {
    const today = new Date().toISOString().split('T')[0];
    todos = todos.filter((t) => !!t.dueDate && t.dueDate < today && t.status !== 'completed' && t.status !== 'cancelled');
  }

  return todos;
}

export async function getTodoById(id: string): Promise<Todo | undefined> {
  const sql = getSql();
  await ensureTable();
  const rows = await sql`select * from todos_live where id = ${id} limit 1`;
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createTodo(todo: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>): Promise<Todo> {
  const sql = getSql();
  await ensureTable();

  const id = `todo-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  await sql`
    insert into todos_live (
      id, title, description, priority, status, due_date,
      related_job_id, related_job_number, related_customer_id, related_customer_name, related_customer_phone,
      assigned_to, assigned_to_name, assigned_to_email,
      created_by, created_by_name, created_at, updated_at, completed_at, tags
    ) values (
      ${id}, ${todo.title}, ${todo.description || null}, ${todo.priority}, ${todo.status}, ${todo.dueDate || null},
      ${todo.relatedJobId || null}, ${todo.relatedJobNumber || null}, ${todo.relatedCustomerId || null}, ${todo.relatedCustomerName || null}, ${todo.relatedCustomerPhone || null},
      ${todo.assignedTo || null}, ${todo.assignedToName || null}, ${todo.assignedToEmail || null},
      ${todo.createdBy}, ${todo.createdByName}, ${now}, ${now}, ${todo.status === 'completed' ? now : null}, ${JSON.stringify(todo.tags || [])}::jsonb
    )
  `;

  const created = await getTodoById(id);
  if (!created) throw new Error('Failed to create todo');
  return created;
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<Todo | null> {
  const sql = getSql();
  await ensureTable();

  const existing = await getTodoById(id);
  if (!existing) return null;

  const merged: Todo = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
    completedAt: updates.status === 'completed' ? new Date().toISOString() : existing.completedAt,
  };

  await sql`
    update todos_live set
      title = ${merged.title},
      description = ${merged.description || null},
      priority = ${merged.priority},
      status = ${merged.status},
      due_date = ${merged.dueDate || null},
      related_job_id = ${merged.relatedJobId || null},
      related_job_number = ${merged.relatedJobNumber || null},
      related_customer_id = ${merged.relatedCustomerId || null},
      related_customer_name = ${merged.relatedCustomerName || null},
      related_customer_phone = ${merged.relatedCustomerPhone || null},
      assigned_to = ${merged.assignedTo || null},
      assigned_to_name = ${merged.assignedToName || null},
      assigned_to_email = ${merged.assignedToEmail || null},
      completed_at = ${merged.completedAt || null},
      tags = ${JSON.stringify(merged.tags || [])}::jsonb,
      updated_at = ${merged.updatedAt}
    where id = ${id}
  `;

  return await getTodoById(id) || null;
}

export async function deleteTodo(id: string): Promise<boolean> {
  const sql = getSql();
  await ensureTable();
  const res = await sql`delete from todos_live where id = ${id}`;
  return (res.count || 0) > 0;
}

export async function getTodoStats() {
  const sql = getSql();
  await ensureTable();

  const rows = await sql<{
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    overdue: number;
    due_today: number;
  }[]>`
    select
      count(*)::int as total,
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'in_progress')::int as in_progress,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where due_date < current_date and status not in ('completed','cancelled'))::int as overdue,
      count(*) filter (where due_date = current_date and status not in ('completed','cancelled'))::int as due_today
    from todos_live
  `;

  const s = rows[0] || { total: 0, pending: 0, in_progress: 0, completed: 0, overdue: 0, due_today: 0 };
  return {
    total: s.total,
    pending: s.pending,
    inProgress: s.in_progress,
    completed: s.completed,
    overdue: s.overdue,
    dueToday: s.due_today,
  };
}
