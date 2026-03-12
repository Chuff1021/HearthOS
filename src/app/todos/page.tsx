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

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed" | "overdue">("all");
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

  function getPriorityColor(priority: TodoPriority) {
    switch (priority) {
      case "urgent": return "bg-red-950 text-red-200 border border-red-700/70";
      case "high": return "bg-amber-950 text-amber-200 border border-amber-700/70";
      case "medium": return "bg-orange-950 text-orange-200 border border-orange-700/70";
      case "low": return "bg-sky-950 text-sky-200 border border-sky-700/70";
    }
  }

  function getStatusColor(status: TodoStatus) {
    switch (status) {
      case "completed": return "bg-emerald-950 text-emerald-200 border border-emerald-700/70";
      case "in_progress": return "bg-blue-950 text-blue-200 border border-blue-700/70";
      case "pending": return "bg-orange-950 text-orange-200 border border-orange-700/70";
      case "cancelled": return "bg-slate-800 text-slate-200 border border-slate-600/70";
      default: return "bg-slate-800 text-slate-200 border border-slate-600/70";
    }
  }

  function getFilterCardStyle(card: "all" | "pending" | "in_progress" | "completed" | "overdue" | "dueToday", active: boolean) {
    const base = {
      background: "var(--color-surface-1)",
      border: "1px solid var(--color-border)",
      boxShadow: "none",
    };

    if (!active) return base;

    switch (card) {
      case "all":
        return {
          background: "linear-gradient(180deg, rgba(255,120,40,0.18), rgba(255,120,40,0.08))",
          border: "1px solid rgba(255,120,40,0.5)",
          boxShadow: "0 0 0 1px rgba(255,120,40,0.35) inset, 0 14px 30px rgba(255,120,40,0.14)",
        };
      case "pending":
        return {
          background: "linear-gradient(180deg, rgba(255,106,0,0.2), rgba(255,106,0,0.08))",
          border: "1px solid rgba(255,106,0,0.5)",
          boxShadow: "0 0 0 1px rgba(255,106,0,0.35) inset, 0 14px 30px rgba(255,106,0,0.14)",
        };
      case "in_progress":
        return {
          background: "linear-gradient(180deg, rgba(37,99,235,0.22), rgba(37,99,235,0.08))",
          border: "1px solid rgba(59,130,246,0.5)",
          boxShadow: "0 0 0 1px rgba(59,130,246,0.35) inset, 0 14px 30px rgba(37,99,235,0.14)",
        };
      case "completed":
        return {
          background: "linear-gradient(180deg, rgba(34,197,94,0.2), rgba(34,197,94,0.08))",
          border: "1px solid rgba(74,222,128,0.5)",
          boxShadow: "0 0 0 1px rgba(74,222,128,0.35) inset, 0 14px 30px rgba(34,197,94,0.14)",
        };
      case "overdue":
        return {
          background: "linear-gradient(180deg, rgba(255,32,78,0.22), rgba(255,32,78,0.08))",
          border: "1px solid rgba(255,77,121,0.52)",
          boxShadow: "0 0 0 1px rgba(255,77,121,0.35) inset, 0 14px 30px rgba(255,32,78,0.14)",
        };
      case "dueToday":
        return {
          background: "linear-gradient(180deg, rgba(245,158,11,0.2), rgba(245,158,11,0.08))",
          border: "1px solid rgba(251,191,36,0.5)",
          boxShadow: "0 0 0 1px rgba(251,191,36,0.35) inset, 0 14px 30px rgba(245,158,11,0.14)",
        };
    }
  }

  function isOverdue(todo: Todo) {
    if (!todo.dueDate || todo.status === "completed" || todo.status === "cancelled") return false;
    const today = new Date().toISOString().split("T")[0];
    return todo.dueDate < today;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[1600px] mx-auto space-y-5">
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                  To-Do List
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Track follow-up items and tasks
                </p>
              </div>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                + New Todo
              </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <button
                onClick={() => setFilter("all")}
                className="p-4 rounded-xl text-left transition-all hover:-translate-y-0.5"
                style={getFilterCardStyle("all", filter === "all")}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>All</p>
                <p className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{stats.total}</p>
              </button>
              <button
                onClick={() => setFilter("pending")}
                className="p-4 rounded-xl text-left transition-all hover:-translate-y-0.5"
                style={getFilterCardStyle("pending", filter === "pending")}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Pending</p>
                <p className="text-2xl font-bold" style={{ color: "#FF4400" }}>{stats.pending}</p>
              </button>
              <button
                onClick={() => setFilter("in_progress")}
                className="p-4 rounded-xl text-left transition-all hover:-translate-y-0.5"
                style={getFilterCardStyle("in_progress", filter === "in_progress")}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>In Progress</p>
                <p className="text-2xl font-bold" style={{ color: "#2563EB" }}>{stats.inProgress}</p>
              </button>
              <button
                onClick={() => setFilter("completed")}
                className="p-4 rounded-xl text-left transition-all hover:-translate-y-0.5"
                style={getFilterCardStyle("completed", filter === "completed")}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Completed</p>
                <p className="text-2xl font-bold" style={{ color: "#98CD00" }}>{stats.completed}</p>
              </button>
              <button
                onClick={() => setFilter("overdue")}
                className="p-4 rounded-xl text-left transition-all hover:-translate-y-0.5"
                style={getFilterCardStyle("overdue", filter === "overdue")}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Overdue</p>
                <p className="text-2xl font-bold" style={{ color: "#FF204E" }}>{stats.overdue}</p>
              </button>
              <div className="p-4 rounded-xl" style={getFilterCardStyle("dueToday", false)}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Due Today</p>
                <p className="text-2xl font-bold" style={{ color: "#F59E0B" }}>{stats.dueToday}</p>
              </div>
            </div>

            {/* Todo List */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              </div>
            ) : (
              <div className="space-y-3">
                {todos.length === 0 ? (
                  <div className="p-8 text-center rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                    <p style={{ color: "var(--color-text-muted)" }}>No todos found</p>
                  </div>
                ) : (
                  todos.map((todo) => (
                    <div 
                      key={todo.id} 
                      className={`p-4 rounded-xl ${isOverdue(todo) ? "border-l-4 border-red-500" : ""}`}
                      style={{ background: "var(--color-surface-1)" }}
                    >
                      <div className="flex items-start gap-4">
                        <button
                          onClick={() => handleUpdateStatus(todo.id, todo.status === "completed" ? "pending" : "completed")}
                          className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            todo.status === "completed" 
                              ? "bg-green-500 border-green-500" 
                              : "border-gray-500 hover:border-green-500"
                          }`}
                        >
                          {todo.status === "completed" && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 
                              className={`font-medium ${todo.status === "completed" ? "line-through opacity-50" : ""}`}
                              style={{ color: "var(--color-text-primary)" }}
                            >
                              {todo.title}
                            </h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(todo.priority)}`}>
                              {todo.priority}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(todo.status)}`}>
                              {todo.status.replace("_", " ")}
                            </span>
                            {isOverdue(todo) && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                                ⚠️ Overdue
                              </span>
                            )}
                          </div>
                          
                          {todo.description && (
                            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                              {todo.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {todo.dueDate && (
                              <span className={isOverdue(todo) ? "text-red-400" : ""}>
                                📅 Due: {new Date(todo.dueDate).toLocaleDateString()}
                              </span>
                            )}
                            {todo.relatedJobNumber && (
                              <span>📋 {todo.relatedJobNumber}</span>
                            )}
                            {todo.relatedCustomerName && (
                              <span>👤 {todo.relatedCustomerName}</span>
                            )}
                            {todo.relatedCustomerPhone && (
                              <a
                                href={`tel:${todo.relatedCustomerPhone}`}
                                className="font-medium transition-colors hover:text-orange-300"
                                style={{ color: "#FDBA74" }}
                              >
                                📞 {todo.relatedCustomerPhone}
                              </a>
                            )}
                            {todo.assignedToName && (
                              <span>👉 {todo.assignedToName}</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <select
                            value={todo.status}
                            onChange={(e) => handleUpdateStatus(todo.id, e.target.value as TodoStatus)}
                            className="px-2 py-1 rounded text-xs border-0 focus:ring-1 focus:ring-orange-500 outline-none"
                            style={{ background: "var(--color-surface-2)", color: "var(--color-text-primary)" }}
                          >
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <button
                            onClick={() => setSelectedTodo(todo)}
                            className="p-2 rounded hover:bg-gray-700 transition-colors"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteTodo(todo.id)}
                            className="p-2 rounded hover:bg-red-500/20 transition-colors"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
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
                  className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none"
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
                    className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none"
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
                  className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none resize-none"
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
                    className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none"
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
                    className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none"
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
                  className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none"
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
                  className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none"
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
                  className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none"
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
                  className="w-full px-4 py-2 rounded-xl border focus:border-orange-500 outline-none"
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
              className="w-full mt-6 py-3 rounded-xl font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              Create Todo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
