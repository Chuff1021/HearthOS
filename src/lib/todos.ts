import { readJsonFile, writeJsonFileWithBackup } from '@/lib/persist-json';

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
  assignedTo?: string;
  assignedToName?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  tags: string[];
}

type TodoStore = { todos: Todo[]; nextId: number };
const FILE = 'todos.json';

function loadStore(): TodoStore {
  const store = readJsonFile<TodoStore>(FILE, { todos: [], nextId: 1 });
  if (!Array.isArray(store.todos)) store.todos = [];
  if (typeof store.nextId !== 'number') store.nextId = 1;
  return store;
}

function saveStore(store: TodoStore) {
  writeJsonFileWithBackup(FILE, store);
}

export function getTodos(filters?: {
  status?: TodoStatus;
  priority?: TodoPriority;
  assignedTo?: string;
  relatedJobId?: string;
  relatedCustomerId?: string;
  overdue?: boolean;
}): Todo[] {
  const store = loadStore();
  let filtered = [...store.todos];
  if (filters?.status) filtered = filtered.filter((t) => t.status === filters.status);
  if (filters?.priority) filtered = filtered.filter((t) => t.priority === filters.priority);
  if (filters?.assignedTo) filtered = filtered.filter((t) => t.assignedTo === filters.assignedTo);
  if (filters?.relatedJobId) filtered = filtered.filter((t) => t.relatedJobId === filters.relatedJobId);
  if (filters?.relatedCustomerId) filtered = filtered.filter((t) => t.relatedCustomerId === filters.relatedCustomerId);
  if (filters?.overdue) {
    const today = new Date().toISOString().split('T')[0];
    filtered = filtered.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'completed' && t.status !== 'cancelled');
  }
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  return filtered.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
  });
}

export function getTodoById(id: string): Todo | undefined {
  return loadStore().todos.find((t) => t.id === id);
}

export function createTodo(todo: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>): Todo {
  const store = loadStore();
  const newTodo: Todo = {
    ...todo,
    id: `todo-${String(store.nextId++).padStart(3, '0')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.todos.unshift(newTodo);
  saveStore(store);
  return newTodo;
}

export function updateTodo(id: string, updates: Partial<Todo>): Todo | null {
  const store = loadStore();
  const idx = store.todos.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  store.todos[idx] = {
    ...store.todos[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
    completedAt: updates.status === 'completed' ? new Date().toISOString() : store.todos[idx].completedAt,
  };
  saveStore(store);
  return store.todos[idx];
}

export function deleteTodo(id: string): boolean {
  const store = loadStore();
  const idx = store.todos.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  store.todos.splice(idx, 1);
  saveStore(store);
  return true;
}

export function getTodoStats() {
  const todos = loadStore().todos;
  const today = new Date().toISOString().split('T')[0];
  const pending = todos.filter((t) => t.status === 'pending').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const completed = todos.filter((t) => t.status === 'completed').length;
  const overdue = todos.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'completed' && t.status !== 'cancelled').length;
  const dueToday = todos.filter((t) => t.dueDate === today && t.status !== 'completed' && t.status !== 'cancelled').length;
  return { total: todos.length, pending, inProgress, completed, overdue, dueToday };
}
