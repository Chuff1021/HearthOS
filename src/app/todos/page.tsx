"use client";

import "@/app/production-workspaces.css";
import "./todos.css";
import { useState, useEffect } from "react";
import { BriefcaseBusiness, CalendarDays, Check, ClipboardCheck, Pencil, Phone, Plus, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type TodoPriority = "low" | "medium" | "high" | "urgent";
type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

interface Todo {
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
  assignedToName?: string;
  createdByName: string;
  createdAt: string;
  tags: string[];
}

function Pill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span
      className="pw-todos-badge"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

function Meta({ icon, color, children }: { icon: "calendar" | "user" | "briefcase" | "tech"; color?: string; children: React.ReactNode }) {
  const Icon = {
    calendar: CalendarDays,
    user: UserRound,
    briefcase: BriefcaseBusiness,
    tech: ShieldCheck,
  }[icon];
  return (
    <span className="pw-todos-meta-item" style={{ color }}>
      <Icon size={14} aria-hidden="true" />
      {children}
    </span>
  );
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed" | "overdue">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TodoPriority>("all");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0, dueToday: 0 });

  // Form state
  const [formTodoType, setFormTodoType] = useState("callback");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState<TodoPriority>("medium");
  const [formDueDate, setFormDueDate] = useState("");
  const [formAssignedTo, setFormAssignedTo] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formCallbackPhone, setFormCallbackPhone] = useState("");
  const [techOptions, setTechOptions] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<Array<{ id: string; name: string; phone?: string }>>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; phone?: string } | null>(null);

  async function loadTodos() {
    setLoading(true);
    try {
      let url = "/api/todos?";
      if (filter !== "all") url += `status=${filter}&`;
      if (filter === "overdue") url += "overdue=true&";
      
      const res = await fetch(url);
      const data = await res.json();
      setTodos(data.todos || []);
      
      // Load stats
      const statsRes = await fetch("/api/todos?stats=true");
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (error) {
      console.error("Failed to load todos:", error);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/techs?activeOnly=true');
        const data = await res.json();
        setTechOptions((data.techs || []).map((t: any) => ({ id: t.id, name: t.name, email: t.email })));
      } catch {
        setTechOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!showCreateModal) return;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customer-lookup?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => ({}));

        setCustomerOptions((data.customers || []).map((c: any) => ({
          id: c.id,
          name: c.displayName || c.name || c.fullName || c.companyName || c.id,
          phone: c.phone || c.primaryPhone || c.mobile || c?.PrimaryPhone?.FreeFormNumber,
        })));
      } catch {
        setCustomerOptions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [customerQuery, showCreateModal]);

  async function handleCreateTodo() {
    const titleFromType: Record<string, string> = {
      callback: "Call Back Customer",
      follow_up: "Follow Up",
      schedule: "Schedule Appointment",
      estimate: "Send/Review Estimate",
      invoice: "Invoice Follow-up",
      parts: "Order/Track Parts",
      warranty: "Warranty Check",
      other: formTitle.trim(),
    };

    const resolvedTitle = titleFromType[formTodoType] || formTitle.trim();
    if (!resolvedTitle) return;

    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: resolvedTitle,
          description: formDescription,
          priority: formPriority,
          dueDate: formDueDate || undefined,
          relatedCustomerId: selectedCustomer?.id,
          relatedCustomerName: selectedCustomer?.name,
          relatedCustomerPhone: formCallbackPhone || selectedCustomer?.phone || undefined,
          assignedTo: formAssignedTo || undefined,
          assignedToName: techOptions.find((t) => t.id === formAssignedTo)?.name,
          assignedToEmail: techOptions.find((t) => t.id === formAssignedTo)?.email,
          tags: formTags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      
      if (res.ok) {
        setShowCreateModal(false);
        resetForm();
        loadTodos();
      }
    } catch (error) {
      console.error("Failed to create todo:", error);
    }
  }

  async function handleUpdateStatus(id: string, status: TodoStatus) {
    try {
      await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      loadTodos();
    } catch (error) {
      console.error("Failed to update todo:", error);
    }
  }

  async function handleDeleteTodo(id: string) {
    if (!confirm("Delete this todo?")) return;
    
    try {
      await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
      loadTodos();
    } catch (error) {
      console.error("Failed to delete todo:", error);
    }
  }

  function resetForm() {
    setFormTodoType("callback");
    setFormTitle("");
    setFormDescription("");
    setFormPriority("medium");
    setFormDueDate("");
    setFormAssignedTo("");
    setFormTags("");
    setFormCallbackPhone("");
    setCustomerQuery("");
    setSelectedCustomer(null);
    setCustomerOptions([]);
  }

  // Semantic colors resolve in both the workspace and dialog themes.
  const PRIORITY_STYLE: Record<TodoPriority, { color: string; bg: string; label: string }> = {
    urgent: { color: "var(--pw-todos-danger)", bg: "var(--pw-todos-danger-soft)", label: "Urgent" },
    high:   { color: "var(--pw-todos-warning)", bg: "var(--pw-todos-warning-soft)", label: "High" },
    medium: { color: "var(--pw-todos-muted)", bg: "var(--pw-todos-soft)", label: "Medium" },
    low:    { color: "var(--pw-todos-muted)", bg: "var(--pw-todos-soft)", label: "Low" },
  };

  const STATUS_STYLE: Record<TodoStatus, { color: string; bg: string; label: string }> = {
    pending:     { color: "var(--pw-todos-muted)", bg: "var(--pw-todos-soft)", label: "Pending" },
    in_progress: { color: "var(--pw-todos-info)", bg: "var(--pw-todos-info-soft)", label: "In progress" },
    completed:   { color: "var(--pw-todos-success)", bg: "var(--pw-todos-success-soft)", label: "Completed" },
    cancelled:   { color: "var(--pw-todos-muted)", bg: "var(--pw-todos-soft)", label: "Cancelled" },
  };

  function isOverdue(todo: Todo) {
    if (!todo.dueDate || todo.status === "completed" || todo.status === "cancelled") return false;
    const today = new Date().toISOString().split("T")[0];
    return todo.dueDate < today;
  }

  // Bucket todos by due date so the list reads like a natural agenda.
  function dueBucket(todo: Todo): { key: string; label: string; sortKey: number } {
    if (todo.status === "completed") return { key: "done", label: "Completed", sortKey: 99 };
    if (todo.status === "cancelled") return { key: "cancelled", label: "Cancelled", sortKey: 100 };
    if (!todo.dueDate) return { key: "noDate", label: "No due date", sortKey: 50 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(todo.dueDate + "T00:00:00");
    due.setHours(0, 0, 0, 0);
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { key: "overdue", label: "Overdue", sortKey: 0 };
    if (diff === 0) return { key: "today", label: "Today", sortKey: 1 };
    if (diff === 1) return { key: "tomorrow", label: "Tomorrow", sortKey: 2 };
    if (diff <= 7) return { key: "thisWeek", label: "This week", sortKey: 3 };
    return { key: "later", label: "Later", sortKey: 10 };
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="pw-workspace pw-todos flex-1 overflow-y-auto p-6">
          <div className="pw-todos-content max-w-[1400px] mx-auto space-y-5">
            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="pw-heading flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="pw-todos-title">Tasks</h1>
                <p className="pw-todos-subtitle">
                  Follow-ups, callbacks, and quick reminders
                </p>
              </div>
              <div className="pw-toolbar flex items-center gap-2">
                <div className="pw-todos-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tasks..."
                    aria-label="Search tasks"
                    className="pw-todos-search-input"
                  />
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="pw-todos-primary"
                  aria-haspopup="dialog"
                >
                  <Plus size={16} aria-hidden="true" />
                  New Task
                </button>
              </div>
            </div>

            {/* ── Money / count tiles (status filters) ───────────────────── */}
            <div className="pw-metrics pw-todos-metrics grid grid-cols-2 md:grid-cols-6 gap-3" role="group" aria-label="Task status">
              {[
                { key: "all" as const, label: "All tasks", count: stats.total, color: "var(--color-text-primary)", accent: "var(--color-text-muted)" },
                { key: "pending" as const, label: "Pending", count: stats.pending, color: "#9a5d12", accent: "#f8971f" },
                { key: "in_progress" as const, label: "In progress", count: stats.inProgress, color: "#2563EB", accent: "#2563EB" },
                { key: "overdue" as const, label: "Overdue", count: stats.overdue, color: "#DC2626", accent: "#DC2626" },
                { key: null, label: "Due today", count: stats.dueToday, color: "#F59E0B", accent: "#F59E0B", noFilter: true },
                { key: "completed" as const, label: "Completed", count: stats.completed, color: "#16A34A", accent: "#16A34A" },
              ].map((tile, i) => {
                const isActive = tile.key !== null && filter === tile.key && !tile.noFilter;
                const clickable = !tile.noFilter && tile.key !== null;
                return (
                  <button
                    key={i}
                    aria-pressed={clickable ? isActive : undefined}
                    aria-disabled={!clickable || undefined}
                    data-status={tile.key ?? "today"}
                    onClick={clickable ? () => setFilter(tile.key as any) : undefined}
                    className="pw-todos-metric"
                  >
                    <p className="pw-todos-metric-label">{tile.label}</p>
                    <p className="pw-todos-metric-value">{tile.count}</p>
                  </button>
                );
              })}
            </div>

            {/* ── Priority filter pills ──────────────────────────────────── */}
            <div className="pw-todos-filterbar" role="group" aria-labelledby="pw-todos-priority-label">
              <span id="pw-todos-priority-label" className="pw-todos-filter-label">Priority</span>
              <div className="pw-todos-priorities">
                {(["all", "urgent", "high", "medium", "low"] as const).map((p) => {
                  const on = priorityFilter === p;
                  const c = p === "all" ? null : PRIORITY_STYLE[p];
                  return (
                    <button
                      key={p}
                      onClick={() => setPriorityFilter(p)}
                      aria-pressed={on}
                      data-priority={p}
                      className="pw-todos-priority"
                    >
                      {p === "all" ? "All" : c!.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Task list grouped by due bucket ────────────────────────── */}
            {loading ? (
              <div className="pw-todos-loading" role="status" aria-label="Loading tasks">
                <div className="pw-todos-spinner animate-spin" aria-hidden="true"></div>
              </div>
            ) : (() => {
              const visible = todos
                .filter((t) => priorityFilter === "all" ? true : t.priority === priorityFilter)
                .filter((t) => {
                  if (!search.trim()) return true;
                  const q = search.toLowerCase();
                  return (t.title || "").toLowerCase().includes(q)
                    || (t.description || "").toLowerCase().includes(q)
                    || (t.relatedCustomerName || "").toLowerCase().includes(q)
                    || (t.assignedToName || "").toLowerCase().includes(q);
                });

              if (visible.length === 0) {
                return (
                  <div className="pw-todos-empty" role="status">
                    <ClipboardCheck size={28} aria-hidden="true" />
                    <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>No tasks here yet</p>
                    <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                      {search.trim() || priorityFilter !== "all" || filter !== "all"
                        ? "Try clearing filters or search."
                        : "Create your first task to get started."}
                    </p>
                  </div>
                );
              }

              // Group by due bucket
              const groups = new Map<string, { label: string; sortKey: number; rows: Todo[] }>();
              for (const t of visible) {
                const b = dueBucket(t);
                const cur = groups.get(b.key) || { label: b.label, sortKey: b.sortKey, rows: [] };
                cur.rows.push(t);
                groups.set(b.key, cur);
              }
              const ordered = [...groups.entries()].sort((a, b) => a[1].sortKey - b[1].sortKey);

              return (
                <div className="pw-todos-groups">
                  {ordered.map(([key, group]) => (
                    <section key={key} className="pw-todos-group" aria-labelledby={`pw-todos-group-${key}`} data-bucket={key}>
                      <div className="pw-todos-group-heading">
                        <h2 id={`pw-todos-group-${key}`}>{group.label}</h2>
                        <span className="pw-todos-group-count">{group.rows.length}</span>
                      </div>
                      <div className="pw-task-list rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                        {group.rows.map((todo, idx) => {
                          const overdue = isOverdue(todo);
                          const pStyle = PRIORITY_STYLE[todo.priority];
                          const sStyle = STATUS_STYLE[todo.status];
                          const completed = todo.status === "completed";
                          return (
                            <article
                              key={todo.id}
                              className="pw-task-row px-4 py-3.5 flex items-start gap-3 transition-colors hover:bg-black/[0.02]"
                              data-priority={todo.priority}
                              data-completed={completed}
                              style={{
                                borderTop: idx === 0 ? "none" : "1px solid var(--color-border)",
                              }}
                            >
                              <button
                                onClick={() => handleUpdateStatus(todo.id, completed ? "pending" : "completed")}
                                aria-label={completed ? `Reopen ${todo.title}` : `Complete ${todo.title}`}
                                aria-pressed={completed}
                                title={completed ? "Reopen task" : "Complete task"}
                                className="pw-todos-check"
                              >
                                {completed && (
                                  <Check size={14} aria-hidden="true" />
                                )}
                              </button>

                              <div className="pw-todos-task-content">
                                <div className="pw-todos-task-heading">
                                  <h3 className="pw-todos-task-title">
                                    {todo.title}
                                  </h3>
                                  <Pill {...pStyle} />
                                  <Pill {...sStyle} />
                                  {overdue && <Pill color="var(--pw-todos-danger)" bg="var(--pw-todos-danger-soft)" label="Overdue" />}
                                </div>

                                {todo.description && (
                                  <p className="pw-todos-description">{todo.description}</p>
                                )}

                                <div className="pw-todos-meta">
                                  {todo.dueDate && (
                                    <Meta icon="calendar" color={overdue ? "var(--pw-todos-danger)" : undefined}>
                                      {new Date(todo.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: undefined })}
                                    </Meta>
                                  )}
                                  {todo.relatedCustomerName && (
                                    <Meta icon="user">{todo.relatedCustomerName}</Meta>
                                  )}
                                  {todo.relatedCustomerPhone && (
                                    <a
                                      href={`tel:${todo.relatedCustomerPhone}`}
                                      className="pw-todos-phone"
                                    >
                                      <Phone size={14} aria-hidden="true" />
                                      {todo.relatedCustomerPhone}
                                    </a>
                                  )}
                                  {todo.relatedJobNumber && (
                                    <Meta icon="briefcase">{todo.relatedJobNumber}</Meta>
                                  )}
                                  {todo.assignedToName && (
                                    <Meta icon="tech">{todo.assignedToName}</Meta>
                                  )}
                                </div>
                              </div>

                              <div className="pw-task-actions flex items-center gap-1 flex-shrink-0">
                                <select
                                  value={todo.status}
                                  aria-label={`Status for ${todo.title}`}
                                  onChange={(e) => handleUpdateStatus(todo.id, e.target.value as TodoStatus)}
                                  className="pw-todos-status"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="in_progress">In progress</option>
                                  <option value="completed">Completed</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                                <button
                                  onClick={() => setSelectedTodo(todo)}
                                  title="Edit"
                                  aria-label={`Edit ${todo.title}`}
                                  className="pw-todos-icon-button"
                                >
                                  <Pencil size={16} aria-hidden="true" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTodo(todo.id)}
                                  title="Delete"
                                  aria-label={`Delete ${todo.title}`}
                                  className="pw-todos-icon-button pw-todos-delete"
                                >
                                  <Trash2 size={16} aria-hidden="true" />
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              );
            })()}
          </div>
        </main>
      </div>

      {/* Create Todo Modal */}
      {showCreateModal && (
        <div className="pw-todo-dialog pw-todo-dialog-backdrop fixed inset-0 z-50">
          <div className="pw-todo-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="pw-todo-dialog-title" tabIndex={-1}>
            <div className="pw-todo-dialog-heading">
              <h2 id="pw-todo-dialog-title">New Task</h2>
              <button 
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="pw-todo-dialog-close"
                aria-label="Close new task"
                title="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            
            <div className="pw-todo-dialog-body">
              <div>
                <label htmlFor="pw-todo-type">Task Type *</label>
                <select
                  id="pw-todo-type"
                  aria-required="true"
                  value={formTodoType}
                  onChange={(e) => setFormTodoType(e.target.value)}
                  className="pw-todo-dialog-control"
                >
                  <option value="callback">Call Back</option>
                  <option value="follow_up">Follow Up</option>
                  <option value="schedule">Schedule Appointment</option>
                  <option value="estimate">Estimate</option>
                  <option value="invoice">Invoice Follow-up</option>
                  <option value="parts">Parts / Material</option>
                  <option value="warranty">Warranty</option>
                  <option value="other">Other (custom)</option>
                </select>
              </div>

              {formTodoType === "other" && (
                <div>
                  <label htmlFor="pw-todo-title">Custom Title *</label>
                  <input
                    id="pw-todo-title"
                    aria-required="true"
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Enter custom todo title"
                    className="pw-todo-dialog-control"
                  />
                </div>
              )}
              
              <div>
                <label htmlFor="pw-todo-description">Description</label>
                <textarea
                  id="pw-todo-description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Additional details..."
                  rows={3}
                  className="pw-todo-dialog-control"
                />
              </div>
              
              <div className="pw-todo-dialog-fields">
                <div>
                  <label htmlFor="pw-todo-priority">Priority</label>
                  <select
                    id="pw-todo-priority"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as TodoPriority)}
                    className="pw-todo-dialog-control"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="pw-todo-due-date">Due Date</label>
                  <input
                    id="pw-todo-due-date"
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="pw-todo-dialog-control"
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="pw-todo-customer">Customer (QuickBooks)</label>
                <input
                  id="pw-todo-customer"
                  type="text"
                  value={selectedCustomer?.name || customerQuery}
                  onChange={(e) => { setSelectedCustomer(null); setCustomerQuery(e.target.value); }}
                  placeholder="Search customer name..."
                  className="pw-todo-dialog-control"
                />
                {!!customerOptions.length && !selectedCustomer && (
                  <div className="pw-todo-dialog-customers" role="group" aria-label="Matching customers">
                    {customerOptions.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSelectedCustomer(c); setFormCallbackPhone(c.phone || ""); setCustomerOptions([]); }}
                        className="pw-todo-dialog-customer"
                      >
                        {c.name} {c.phone ? `· ${c.phone}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="pw-todo-phone">Callback Phone</label>
                <input
                  id="pw-todo-phone"
                  inputMode="tel"
                  type="text"
                  value={formCallbackPhone}
                  onChange={(e) => setFormCallbackPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="pw-todo-dialog-control"
                />
              </div>

              <div>
                <label htmlFor="pw-todo-assignee">Assign To</label>
                <select
                  id="pw-todo-assignee"
                  value={formAssignedTo}
                  onChange={(e) => setFormAssignedTo(e.target.value)}
                  className="pw-todo-dialog-control"
                >
                  <option value="">Unassigned</option>
                  {techOptions.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="pw-todo-tags">Tags (comma separated)</label>
                <input
                  id="pw-todo-tags"
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="billing, follow-up, urgent"
                  className="pw-todo-dialog-control"
                />
              </div>
            </div>
            
            <div className="pw-todo-dialog-footer">
              <button
                onClick={handleCreateTodo}
                disabled={formTodoType === "other" && !formTitle.trim()}
                className="pw-todo-dialog-primary"
              >
                <Plus size={16} aria-hidden="true" />
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
