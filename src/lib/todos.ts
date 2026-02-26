// Todo List Data Store
// For tracking follow-up items from the dashboard

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

// Seed todos
let todos: Todo[] = [
  {
    id: "todo-001",
    title: "Follow up with Robert Chen on installation date",
    description: "Confirm preferred installation date for new Napoleon GVFL60",
    priority: "high",
    status: "pending",
    dueDate: "2026-02-28",
    relatedJobId: "job-002",
    relatedJobNumber: "JOB-2026-0143",
    relatedCustomerId: "cust-002",
    relatedCustomerName: "Robert Chen",
    assignedTo: "tech-002",
    assignedToName: "Sarah Williams",
    createdBy: "admin",
    createdByName: "Admin",
    createdAt: "2026-02-25T10:00:00Z",
    updatedAt: "2026-02-25T10:00:00Z",
    tags: ["customer", "follow-up"],
  },
  {
    id: "todo-002",
    title: "Order replacement gas valve for Karen Wilson",
    description: "Gas valve on Valor H4 needs replacement - parts ordered",
    priority: "medium",
    status: "in_progress",
    dueDate: "2026-02-27",
    relatedJobId: "job-007",
    relatedJobNumber: "JOB-2026-0147",
    relatedCustomerId: "cust-007",
    relatedCustomerName: "Karen Wilson",
    assignedTo: "tech-003",
    assignedToName: "Tom Davis",
    createdBy: "tech-003",
    createdByName: "Tom Davis",
    createdAt: "2026-02-24T15:00:00Z",
    updatedAt: "2026-02-24T15:00:00Z",
    tags: ["parts", "repair"],
  },
  {
    id: "todo-003",
    title: "Schedule annual inspection for Linda Martinez",
    description: "Annual service plan - schedule Q2 inspection",
    priority: "low",
    status: "pending",
    relatedCustomerId: "cust-001",
    relatedCustomerName: "Linda Martinez",
    createdBy: "admin",
    createdByName: "Admin",
    createdAt: "2026-02-20T10:00:00Z",
    updatedAt: "2026-02-20T10:00:00Z",
    tags: ["service", "annual"],
  },
  {
    id: "todo-004",
    title: "Resolve overdue invoice INV-2024-0888",
    description: "Susan Park pellet stove service - invoice overdue",
    priority: "high",
    status: "pending",
    relatedJobId: "job-005",
    relatedCustomerId: "cust-005",
    relatedCustomerName: "Susan Park",
    createdBy: "admin",
    createdByName: "Admin",
    createdAt: "2026-02-15T10:00:00Z",
    updatedAt: "2026-02-15T10:00:00Z",
    tags: ["billing", "overdue"],
  },
  {
    id: "todo-005",
    title: "Get quote approved for Michael Davis fireplace",
    description: "Send final estimate for Napoleon Lexington installation",
    priority: "medium",
    status: "pending",
    dueDate: "2026-02-26",
    relatedJobId: "job-006",
    relatedJobNumber: "JOB-2026-0147",
    relatedCustomerId: "cust-006",
    relatedCustomerName: "Michael Davis",
    assignedTo: "tech-002",
    assignedToName: "Sarah Williams",
    createdBy: "tech-002",
    createdByName: "Sarah Williams",
    createdAt: "2026-02-23T11:00:00Z",
    updatedAt: "2026-02-23T11:00:00Z",
    tags: ["estimate", "sales"],
  },
  {
    id: "todo-006",
    title: "Complete safety training certification",
    description: "NFI recertification due next month",
    priority: "medium",
    status: "pending",
    dueDate: "2026-03-15",
    assignedTo: "tech-004",
    assignedToName: "Chris Lee",
    createdBy: "tech-004",
    createdByName: "Chris Lee",
    createdAt: "2026-02-20T09:00:00Z",
    updatedAt: "2026-02-20T09:00:00Z",
    tags: ["training", "certification"],
  },
];

let nextTodoId = 7;

// Get all todos
export function getTodos(filters?: {
  status?: TodoStatus;
  priority?: TodoPriority;
  assignedTo?: string;
  relatedJobId?: string;
  relatedCustomerId?: string;
  overdue?: boolean;
}): Todo[] {
  let filtered = [...todos];

  if (filters?.status) {
    filtered = filtered.filter((t) => t.status === filters.status);
  }
  if (filters?.priority) {
    filtered = filtered.filter((t) => t.priority === filters.priority);
  }
  if (filters?.assignedTo) {
    filtered = filtered.filter((t) => t.assignedTo === filters.assignedTo);
  }
  if (filters?.relatedJobId) {
    filtered = filtered.filter((t) => t.relatedJobId === filters.relatedJobId);
  }
  if (filters?.relatedCustomerId) {
    filtered = filtered.filter((t) => t.relatedCustomerId === filters.relatedCustomerId);
  }
  if (filters?.overdue) {
    const today = new Date().toISOString().split("T")[0];
    filtered = filtered.filter((t) => 
      t.dueDate && t.dueDate < today && t.status !== "completed" && t.status !== "cancelled"
    );
  }

  // Sort by priority (urgent first), then due date
  return filtered.sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// Get single todo
export function getTodoById(id: string): Todo | undefined {
  return todos.find((t) => t.id === id);
}

// Create todo
export function createTodo(todo: Omit<Todo, "id" | "createdAt" | "updatedAt">): Todo {
  const newTodo: Todo = {
    ...todo,
    id: `todo-${String(nextTodoId++).padStart(3, "0")}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  todos.unshift(newTodo);
  return newTodo;
}

// Update todo
export function updateTodo(id: string, updates: Partial<Todo>): Todo | null {
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  todos[idx] = {
    ...todos[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
    completedAt: updates.status === "completed" ? new Date().toISOString() : todos[idx].completedAt,
  };
  return todos[idx];
}

// Delete todo
export function deleteTodo(id: string): boolean {
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  todos.splice(idx, 1);
  return true;
}

// Get stats
export function getTodoStats() {
  const today = new Date().toISOString().split("T")[0];
  const pending = todos.filter((t) => t.status === "pending").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const completed = todos.filter((t) => t.status === "completed").length;
  const overdue = todos.filter((t) =>
    t.dueDate && t.dueDate < today && t.status !== "completed" && t.status !== "cancelled"
  ).length;
  const dueToday = todos.filter((t) => t.dueDate === today && t.status !== "completed" && t.status !== "cancelled").length;

  return { total: todos.length, pending, inProgress, completed, overdue, dueToday };
}
