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
  relatedCustomerName?: string;
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
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState<TodoPriority>("medium");
  const [formDueDate, setFormDueDate] = useState("");
  const [formAssignedTo, setFormAssignedTo] = useState("");
  const [formTags, setFormTags] = useState("");

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

  async function handleCreateTodo() {
    if (!formTitle.trim()) return;
    
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription,
          priority: formPriority,
          dueDate: formDueDate || undefined,
          assignedTo: formAssignedTo || undefined,
          assignedToName: formAssignedTo === "tech-001" ? "Mike Johnson" : 
                          formAssignedTo === "tech-002" ? "Sarah Williams" :
                          formAssignedTo === "tech-003" ? "Tom Davis" :
                          formAssignedTo === "tech-004" ? "Chris Lee" : undefined,
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
    setFormTitle("");
    setFormDescription("");
    setFormPriority("medium");
    setFormDueDate("");
    setFormAssignedTo("");
    setFormTags("");
  }

  function getPriorityColor(priority: TodoPriority) {
    switch (priority) {
      case "urgent": return "bg-red-500/20 text-red-400";
      case "high": return "bg-orange-500/20 text-orange-400";
      case "medium": return "bg-yellow-500/20 text-yellow-400";
      case "low": return "bg-blue-500/20 text-blue-400";
    }
  }

  function getStatusColor(status: TodoStatus) {
    switch (status) {
      case "completed": return "bg-green-500/20 text-green-400";
      case "in_progress": return "bg-blue-500/20 text-blue-400";
      case "pending": return "bg-gray-500/20 text-gray-400";
      case "cancelled": return "bg-red-500/20 text-red-400";
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
                  Todo List
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
                className={`p-4 rounded-xl text-left transition-all ${filter === "all" ? "ring-2 ring-orange-500" : ""}`}
                style={{ background: "var(--color-surface-1)" }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>All</p>
                <p className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{stats.total}</p>
              </button>
              <button
                onClick={() => setFilter("pending")}
                className={`p-4 rounded-xl text-left transition-all ${filter === "pending" ? "ring-2 ring-orange-500" : ""}`}
                style={{ background: "var(--color-surface-1)" }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Pending</p>
                <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{stats.pending}</p>
              </button>
              <button
                onClick={() => setFilter("in_progress")}
                className={`p-4 rounded-xl text-left transition-all ${filter === "in_progress" ? "ring-2 ring-orange-500" : ""}`}
                style={{ background: "var(--color-surface-1)" }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>In Progress</p>
                <p className="text-2xl font-bold" style={{ color: "#3b82f6" }}>{stats.inProgress}</p>
              </button>
              <button
                onClick={() => setFilter("completed")}
                className={`p-4 rounded-xl text-left transition-all ${filter === "completed" ? "ring-2 ring-orange-500" : ""}`}
                style={{ background: "var(--color-surface-1)" }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Completed</p>
                <p className="text-2xl font-bold" style={{ color: "#10b981" }}>{stats.completed}</p>
              </button>
              <button
                onClick={() => setFilter("overdue")}
                className={`p-4 rounded-xl text-left transition-all ${filter === "overdue" ? "ring-2 ring-orange-500" : ""}`}
                style={{ background: "var(--color-surface-1)" }}
              >
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Overdue</p>
                <p className="text-2xl font-bold" style={{ color: stats.overdue > 0 ? "#ef4444" : "#10b981" }}>{stats.overdue}</p>
              </button>
              <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-1)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Due Today</p>
                <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{stats.dueToday}</p>
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
          <div className="bg-[#1a1a2e] w-full max-w-md rounded-2xl p-6">
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
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Title *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                  style={{ color: "var(--color-text-primary)" }}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Additional details..."
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none resize-none"
                  style={{ color: "var(--color-text-primary)" }}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Priority</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as TodoPriority)}
                    className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                    style={{ color: "var(--color-text-primary)" }}
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
                    className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                    style={{ color: "var(--color-text-primary)" }}
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Assign To</label>
                <select
                  value={formAssignedTo}
                  onChange={(e) => setFormAssignedTo(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <option value="">Unassigned</option>
                  <option value="tech-001">Mike Johnson</option>
                  <option value="tech-002">Sarah Williams</option>
                  <option value="tech-003">Tom Davis</option>
                  <option value="tech-004">Chris Lee</option>
                </select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Tags (comma separated)</label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="billing, follow-up, urgent"
                  className="w-full px-4 py-2 rounded-xl bg-[#252540] border border-gray-700 focus:border-orange-500 outline-none"
                  style={{ color: "var(--color-text-primary)" }}
                />
              </div>
            </div>
            
            <button 
              onClick={handleCreateTodo}
              disabled={!formTitle.trim()}
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
