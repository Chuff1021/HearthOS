"use client";

import { useState, useEffect } from "react";
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
      className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ background: bg, color, border: `1px solid ${color}33` }}
    >
      {label}
    </span>
  );
}

function Meta({ icon, color, children }: { icon: "calendar" | "user" | "briefcase" | "tech"; color?: string; children: React.ReactNode }) {
  const path = {
    calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    briefcase: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m-3 7h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v3a2 2 0 002 2z",
    tech: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  }[icon];
  return (
    <span className="inline-flex items-center gap-1" style={{ color }}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
      </svg>
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

  // Priority + status palette aligned with the rest of the site (ember theme).
  const PRIORITY_STYLE: Record<TodoPriority, { color: string; bg: string; label: string }> = {
    urgent: { color: "#DC2626", bg: "rgba(220,38,38,0.12)", label: "Urgent" },
    high:   { color: "#F59E0B", bg: "rgba(245,158,11,0.12)", label: "High" },
    medium: { color: "#f8971f", bg: "rgba(248,151,31,0.14)", label: "Medium" },
    low:    { color: "#3B82F6", bg: "rgba(59,130,246,0.12)", label: "Low" },
  };

  const STATUS_STYLE: Record<TodoStatus, { color: string; bg: string; label: string }> = {
    pending:     { color: "#9a5d12", bg: "rgba(248,151,31,0.12)", label: "Pending" },
    in_progress: { color: "#2563EB", bg: "rgba(37,99,235,0.12)", label: "In progress" },
    completed:   { color: "#16A34A", bg: "rgba(22,163,74,0.12)", label: "Completed" },
    cancelled:   { color: "var(--color-text-muted)", bg: "var(--color-surface-2)", label: "Cancelled" },
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
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">
            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Tasks</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Follow-ups, callbacks, and quick reminders
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" /></svg>
                  </span>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tasks..."
                    className="pl-9 pr-3 py-2 rounded-lg text-sm w-64 outline-none"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  />
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #f8971f, #eaa23f)" }}
                >
                  + New Task
                </button>
              </div>
            </div>

            {/* ── Money / count tiles (status filters) ───────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
                    onClick={clickable ? () => setFilter(tile.key as any) : undefined}
                    className={`p-4 rounded-xl text-left transition-all ${clickable ? "hover:-translate-y-0.5 cursor-pointer" : "cursor-default"}`}
                    style={{
                      background: "var(--color-surface-1)",
                      border: isActive ? `2px solid ${tile.accent}` : "1px solid var(--color-border)",
                      borderLeft: `4px solid ${tile.accent}`,
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{tile.label}</p>
                    <p className="text-2xl font-bold mt-1" style={{ color: tile.color }}>{tile.count}</p>
                  </button>
                );
              })}
            </div>

            {/* ── Priority filter pills ──────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Priority:</span>
              {(["all", "urgent", "high", "medium", "low"] as const).map((p) => {
                const on = priorityFilter === p;
                const c = p === "all" ? null : PRIORITY_STYLE[p];
                return (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(p)}
                    className="text-xs px-2.5 py-1 rounded-full transition-colors"
                    style={{
                      background: on ? (c?.bg ?? "var(--color-ember)") : "var(--color-surface-1)",
                      color: on ? (c?.color ?? "#fff") : "var(--color-text-muted)",
                      border: `1px solid ${on ? (c?.color ?? "var(--color-ember)") : "var(--color-border)"}`,
                      fontWeight: on ? 600 : 500,
                    }}
                  >
                    {p === "all" ? "All" : c!.label}
                  </button>
                );
              })}
            </div>

            {/* ── Task list grouped by due bucket ────────────────────────── */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8" style={{ border: "2px solid var(--color-border)", borderTopColor: "var(--color-ember)" }}></div>
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
                  <div className="rounded-xl p-12 text-center" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3" style={{ background: "rgba(248,151,31,0.12)", color: "#f8971f" }}>
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                    </div>
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
                <div className="space-y-5">
                  {ordered.map(([key, group]) => (
                    <div key={key}>
                      <div className="flex items-baseline gap-2 mb-2 px-1">
                        <h2 className="text-sm font-bold" style={{ color: key === "overdue" ? "#DC2626" : "var(--color-text-primary)" }}>{group.label}</h2>
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{group.rows.length}</span>
                      </div>
                      <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
                        {group.rows.map((todo, idx) => {
                          const overdue = isOverdue(todo);
                          const pStyle = PRIORITY_STYLE[todo.priority];
                          const sStyle = STATUS_STYLE[todo.status];
                          const completed = todo.status === "completed";
                          return (
                            <div
                              key={todo.id}
                              className="px-4 py-3.5 flex items-start gap-3 transition-colors hover:bg-black/[0.02]"
                              style={{
                                borderTop: idx === 0 ? "none" : "1px solid var(--color-border)",
                                borderLeft: `3px solid ${pStyle.color}`,
                              }}
                            >
                              <button
                                onClick={() => handleUpdateStatus(todo.id, completed ? "pending" : "completed")}
                                className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                                style={{
                                  background: completed ? "#16A34A" : "transparent",
                                  border: completed ? "2px solid #16A34A" : "2px solid var(--color-border)",
                                }}
                              >
                                {completed && (
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)", textDecoration: completed ? "line-through" : undefined, opacity: completed ? 0.6 : 1 }}>
                                    {todo.title}
                                  </h3>
                                  <Pill {...pStyle} />
                                  <Pill {...sStyle} />
                                  {overdue && <Pill color="#DC2626" bg="rgba(220,38,38,0.12)" label="Overdue" />}
                                </div>

                                {todo.description && (
                                  <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>{todo.description}</p>
                                )}

                                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                                  {todo.dueDate && (
                                    <Meta icon="calendar" color={overdue ? "#DC2626" : undefined}>
                                      {new Date(todo.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: undefined })}
                                    </Meta>
                                  )}
                                  {todo.relatedCustomerName && (
                                    <Meta icon="user">{todo.relatedCustomerName}</Meta>
                                  )}
                                  {todo.relatedCustomerPhone && (
                                    <a
                                      href={`tel:${todo.relatedCustomerPhone}`}
                                      className="inline-flex items-center gap-1 hover:underline font-medium"
                                      style={{ color: "#f8971f" }}
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
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

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <select
                                  value={todo.status}
                                  onChange={(e) => handleUpdateStatus(todo.id, e.target.value as TodoStatus)}
                                  className="px-2 py-1 rounded-md text-[11px] outline-none"
                                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="in_progress">In progress</option>
                                  <option value="completed">Completed</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                                <button
                                  onClick={() => setSelectedTodo(todo)}
                                  title="Edit"
                                  className="p-1.5 rounded-md transition-colors hover:bg-black/5"
                                  style={{ color: "var(--color-text-muted)" }}
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteTodo(todo.id)}
                                  title="Delete"
                                  className="p-1.5 rounded-md transition-colors hover:bg-red-50"
                                  style={{ color: "var(--color-text-muted)" }}
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </main>
      </div>

      {/* Create Todo Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">New Todo</h2>
              <button 
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Todo Type *</label>
                <select
                  value={formTodoType}
                  onChange={(e) => setFormTodoType(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none"
                  style={{
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface-3)",
                    borderColor: "var(--color-border-hover)",
                  }}
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
                  <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Custom Title *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Enter custom todo title"
                    className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none"
                    style={{
                      color: "var(--color-text-primary)",
                      background: "var(--color-surface-3)",
                      borderColor: "var(--color-border-hover)",
                    }}
                  />
                </div>
              )}
              
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Additional details..."
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none resize-none"
                  style={{
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface-3)",
                    borderColor: "var(--color-border-hover)",
                  }}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Priority</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as TodoPriority)}
                    className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none"
                    style={{
                      color: "var(--color-text-primary)",
                      background: "var(--color-surface-3)",
                      borderColor: "var(--color-border-hover)",
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Due Date</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none"
                    style={{
                      color: "var(--color-text-primary)",
                      background: "var(--color-surface-3)",
                      borderColor: "var(--color-border-hover)",
                    }}
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Customer (QuickBooks)</label>
                <input
                  type="text"
                  value={selectedCustomer?.name || customerQuery}
                  onChange={(e) => { setSelectedCustomer(null); setCustomerQuery(e.target.value); }}
                  placeholder="Search customer name..."
                  className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none"
                  style={{
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface-3)",
                    borderColor: "var(--color-border-hover)",
                  }}
                />
                {!!customerOptions.length && !selectedCustomer && (
                  <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                    {customerOptions.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSelectedCustomer(c); setFormCallbackPhone(c.phone || ""); setCustomerOptions([]); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                      >
                        {c.name} {c.phone ? `· ${c.phone}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Callback Phone</label>
                <input
                  type="text"
                  value={formCallbackPhone}
                  onChange={(e) => setFormCallbackPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none"
                  style={{
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface-3)",
                    borderColor: "var(--color-border-hover)",
                  }}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Assign To</label>
                <select
                  value={formAssignedTo}
                  onChange={(e) => setFormAssignedTo(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none"
                  style={{
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface-3)",
                    borderColor: "var(--color-border-hover)",
                  }}
                >
                  <option value="">Unassigned</option>
                  {techOptions.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Tags (comma separated)</label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="billing, follow-up, urgent"
                  className="w-full px-4 py-2 rounded-xl border focus:border-amber-500 outline-none"
                  style={{
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface-3)",
                    borderColor: "var(--color-border-hover)",
                  }}
                />
              </div>
            </div>
            
            <button
              onClick={handleCreateTodo}
              disabled={formTodoType === "other" && !formTitle.trim()}
              className="w-full mt-6 py-3 rounded-lg font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #f8971f, #eaa23f)" }}
            >
              Create Task
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
