"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type TimeEntry = {
  id: string;
  techId: string;
  techName?: string;
  clockInAt: string;
  clockOutAt?: string;
  totalMinutes?: number;
  status: "open" | "closed";
  edited?: boolean;
  editNote?: string;
};

type TimeOffRequest = {
  id: string;
  techId: string;
  techName?: string;
  type: "paid_vacation" | "unpaid_vacation" | "unpaid_appointment_time";
  startDate: string;
  endDate: string;
  reason?: string;
  status: "pending" | "approved" | "denied";
};

export default function AdminTimePage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [editNote, setEditNote] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [timeRes, reqRes] = await Promise.all([
        fetch("/api/time/entries"),
        fetch("/api/time-off-requests"),
      ]);
      const timeData = await timeRes.json();
      const reqData = await reqRes.json();
      setEntries(timeData.entries || []);
      setRequests(reqData.requests || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const totalHours = useMemo(() => {
    const mins = entries.filter((e) => e.status === "closed").reduce((s, e) => s + Number(e.totalMinutes || 0), 0);
    return (mins / 60).toFixed(1);
  }, [entries]);

  async function saveEntryEdit() {
    if (!editing) return;
    await fetch("/api/time/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        clockInAt: editing.clockInAt,
        clockOutAt: editing.clockOutAt,
        editNote: editNote || "Manual admin correction",
      }),
    });
    setEditing(null);
    setEditNote("");
    await loadAll();
  }

  async function updateRequestStatus(id: string, status: "approved" | "denied") {
    await fetch("/api/time-off-requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await loadAll();
  }

  function exportCsv() {
    const rows = [
      ["id", "techId", "techName", "clockInAt", "clockOutAt", "totalMinutes", "status", "edited", "editNote"],
      ...entries.map((e) => [
        e.id,
        e.techId,
        e.techName || "",
        e.clockInAt,
        e.clockOutAt || "",
        String(e.totalMinutes || 0),
        e.status,
        String(!!e.edited),
        (e.editNote || "").replace(/,/g, " "),
      ]),
    ];

    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h1 className="font-bold text-xl" style={{ color: "var(--color-text-primary)" }}>Time & Attendance Admin</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{entries.length} entries · {totalHours} total hours</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)" }}>Export CSV</button>
            <button onClick={loadAll} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: "1px solid var(--color-border)" }}>Refresh</button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
          <section className="xl:col-span-2 rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <h2 className="font-semibold mb-3">Timesheet Entries</h2>
            {loading ? <p>Loading...</p> : (
              <div className="space-y-2">
                {entries.map((e) => (
                  <div key={e.id} className="p-3 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-sm">{e.techName || e.techId}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          In: {new Date(e.clockInAt).toLocaleString()} · Out: {e.clockOutAt ? new Date(e.clockOutAt).toLocaleString() : "Open"}
                        </div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Minutes: {e.totalMinutes || 0} {e.edited ? "· Edited" : ""}
                        </div>
                      </div>
                      <button onClick={() => setEditing(e)} className="px-2 py-1 rounded text-xs" style={{ border: "1px solid var(--color-border)" }}>Edit</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <h2 className="font-semibold mb-3">Time Off Requests</h2>
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="p-3 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
                  <div className="text-sm font-semibold">{r.techName || r.techId}</div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{r.type.replace(/_/g, " ")}</div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{r.startDate} → {r.endDate}</div>
                  <div className="mt-2 flex gap-2">
                    <button disabled={r.status !== "pending"} onClick={() => updateRequestStatus(r.id, "approved")} className="px-2 py-1 rounded text-xs" style={{ background: "rgba(152,205,0,0.15)", color: "#98CD00" }}>Approve</button>
                    <button disabled={r.status !== "pending"} onClick={() => updateRequestStatus(r.id, "denied")} className="px-2 py-1 rounded text-xs" style={{ background: "rgba(255,32,78,0.15)", color: "#FF204E" }}>Deny</button>
                    <span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>{r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <h3 className="font-bold mb-3">Edit Time Entry</h3>
            <div className="space-y-3">
              <input type="datetime-local" value={editing.clockInAt.slice(0,16)} onChange={(e) => setEditing({ ...editing, clockInAt: new Date(e.target.value).toISOString() })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              <input type="datetime-local" value={editing.clockOutAt ? editing.clockOutAt.slice(0,16) : ""} onChange={(e) => setEditing({ ...editing, clockOutAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
              <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Reason for manual edit" rows={2} className="w-full px-3 py-2 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }} />
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg" style={{ border: "1px solid var(--color-border)" }}>Cancel</button>
              <button onClick={saveEntryEdit} className="px-3 py-2 rounded-lg text-white" style={{ background: "#2563EB" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
