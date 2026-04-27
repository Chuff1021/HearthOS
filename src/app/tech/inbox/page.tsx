"use client";

import { useEffect, useState } from "react";
import TechBottomNav from "@/components/tech/TechBottomNav";

type Todo = {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  relatedCustomerName?: string;
  relatedCustomerPhone?: string;
};

export default function TechInboxPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [techName, setTechName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string>("");

  async function loadInbox() {
    setLoading(true);
    try {
      const res = await fetch('/api/tech/inbox', { cache: 'no-store' });
      const data = await res.json();
      if (data?.unresolved) {
        setNote(data.reason || 'Tech account is not linked yet.');
        setTodos([]);
      } else {
        setNote('');
        setTechName(data?.tech?.name || 'Tech');
        setTodos((data?.todos || []).filter((t: Todo) => t.status !== 'completed' && t.status !== 'cancelled'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function markDone(id: string) {
    await fetch('/api/todos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'completed' }),
    });
    loadInbox();
  }

  useEffect(() => {
    loadInbox();
    const t = setInterval(loadInbox, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col min-h-screen pb-32" style={{ background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <header
        className="sticky top-0 z-10 px-4 pb-4"
        style={{
          paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.75rem))",
          background: 'var(--color-surface-1)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h1 className="text-lg font-semibold">Tech Inbox</h1>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{techName ? `${techName} · assigned to you` : 'Assigned to you'}</p>
      </header>

      <div className="p-4 space-y-3">
        {note && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(255,68,0,0.12)', border: '1px solid rgba(255,68,0,0.35)', color: '#f8971f' }}>
            {note}
          </div>
        )}

        {loading ? (
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading inbox…</div>
        ) : todos.length === 0 ? (
          <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>No assigned todos right now.</p>
          </div>
        ) : (
          todos.map((todo) => (
            <div key={todo.id} className="rounded-xl p-4" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{todo.title}</h3>
                  {!!todo.description && <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{todo.description}</p>}
                  <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {todo.relatedCustomerName ? `Customer: ${todo.relatedCustomerName}` : 'No customer linked'}
                    {todo.dueDate ? ` · Due: ${todo.dueDate}` : ''}
                  </div>
                </div>
                <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(255,68,0,0.12)', color: '#f8971f' }}>
                  {todo.priority.toUpperCase()}
                </span>
              </div>

              <div className="mt-3 flex gap-2">
                {todo.relatedCustomerPhone ? (
                  <a
                    href={`tel:${todo.relatedCustomerPhone}`}
                    className="flex-1 py-2 text-center rounded-lg text-sm font-medium"
                    style={{ background: 'linear-gradient(135deg,#22C55E,#16A34A)', color: '#fff' }}
                  >
                    📞 Call {todo.relatedCustomerPhone}
                  </a>
                ) : (
                  <button disabled className="flex-1 py-2 rounded-lg text-sm opacity-60" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}>
                    No callback number
                  </button>
                )}
                <button
                  onClick={() => markDone(todo.id)}
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}
                >
                  Mark Done
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <TechBottomNav active="inbox" />
    </div>
  );
}
