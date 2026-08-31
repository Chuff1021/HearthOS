"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Eye, KeyRound, Play, ShieldCheck, Square } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Organization = { id: string; name: string; slug: string };
type Session = {
  id: string;
  organization: { id: string; name: string };
  reason: string;
  accessMode: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export default function PlatformSupportPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [orgId, setOrgId] = useState("");
  const [reason, setReason] = useState("");
  const [accessMode, setAccessMode] = useState("read_only");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/platform/support-access", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load support access");
    setOrganizations(data.organizations || []);
    setSessions(data.sessions || []);
    setOrgId((current) => current || data.organizations?.[0]?.id || "");
  }, []);

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load"));
  }, [load]);

  async function requestAccess() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/support-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId, reason, accessMode, minutes: 60 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      setReason("");
      setMessage("Access request sent to the dealer for approval.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateSession(sessionId: string, action: "approve" | "activate" | "end") {
    setBusy(true);
    try {
      const response = await fetch("/api/platform/support-access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Update failed");
      await load();
      if (action === "activate") window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-[1180px] space-y-5">
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Platform Support</h1>
              <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Dealer-approved, time-limited access with a permanent audit trail.</p>
            </div>

            {organizations.length > 0 && <section className="glass-panel grid gap-4 p-5 md:grid-cols-[1fr_180px]">
              <div className="space-y-4">
                <label className="block text-sm font-medium">
                  Company
                  <select value={orgId} onChange={(event) => setOrgId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2.5 text-sm">
                    {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Support reason
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Describe the specific issue and records that need review" className="mt-1.5 w-full resize-none rounded-lg border border-black/10 bg-white/70 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="space-y-3">
                <button onClick={() => setAccessMode("read_only")} className={`glass-chip flex w-full items-center gap-2 px-3 py-2.5 text-sm ${accessMode === "read_only" ? "ring-2 ring-orange-400" : ""}`}><Eye size={16} /> Read only</button>
                <button onClick={() => setAccessMode("read_write")} className={`glass-chip flex w-full items-center gap-2 px-3 py-2.5 text-sm ${accessMode === "read_write" ? "ring-2 ring-orange-400" : ""}`}><KeyRound size={16} /> Read and write</button>
                <button disabled={busy || !orgId || reason.trim().length < 10} onClick={requestAccess} className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><ShieldCheck size={16} /> Request access</button>
              </div>
            </section>}

            {message && <div className="glass-chip px-4 py-3 text-sm">{message}</div>}

            <section className="glass-panel overflow-hidden">
              <div className="border-b border-black/5 px-5 py-4"><h2 className="font-semibold">Access history</h2></div>
              <div className="divide-y divide-black/5">
                {sessions.map((session) => (
                  <div key={session.id} className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr_130px_150px] md:items-center">
                    <div><div className="font-medium">{session.organization.name}</div><div className="mt-1 flex items-center gap-1 text-xs text-gray-500"><Clock size={13} /> {new Date(session.createdAt).toLocaleString()}</div></div>
                    <div className="text-sm text-gray-600">{session.reason}</div>
                    <div><span className="glass-chip inline-flex px-2.5 py-1 text-xs font-medium capitalize">{session.status.replace("_", " ")}</span></div>
                    <div className="flex justify-end gap-2">
                      {session.status === "pending" && <button title="Approve access" disabled={busy} onClick={() => updateSession(session.id, "approve")} className="glass-chip flex items-center gap-2 px-3 py-2 text-xs font-medium"><ShieldCheck size={16} /> Approve</button>}
                      {session.status === "approved" && <button title="Activate access" disabled={busy} onClick={() => updateSession(session.id, "activate")} className="glass-chip p-2"><Play size={16} /></button>}
                      {session.status === "active" && <button title="End access" disabled={busy} onClick={() => updateSession(session.id, "end")} className="glass-chip p-2"><Square size={16} /></button>}
                    </div>
                  </div>
                ))}
                {sessions.length === 0 && <div className="px-5 py-10 text-center text-sm text-gray-500">No support access has been requested.</div>}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
