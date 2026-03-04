"use client";

import { useEffect, useState } from "react";

type DispatchTech = {
  id: string;
  name: string;
  initials?: string;
  role?: string;
  jobsToday: number;
  jobsDone: number;
  currentJob?: { id: string; title: string; customer: string; address?: string; startedAt?: string } | null;
  nextJob?: { id: string; title: string; customer: string; scheduledTime: string } | null;
};

export default function DispatchBoard() {
  const [techs, setTechs] = useState<DispatchTech[]>([]);

  async function load() {
    try {
      const res = await fetch('/api/dispatch', { cache: 'no-store' });
      const data = await res.json();
      setTechs(data.techs || []);
    } catch {
      setTechs([]);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Dispatch Board</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Live from real tech + job records</p>
      </div>

      {techs.length === 0 ? (
        <div className="p-5 text-sm" style={{ color: "var(--color-text-muted)" }}>No tech activity yet. Add team members and jobs to populate dispatch.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {techs.map((tech, idx) => (
            <div key={tech.id} className="p-4" style={{ borderRight: idx % 4 !== 3 ? "1px solid var(--color-border)" : "none", borderTop: idx >= 4 ? "1px solid var(--color-border)" : "none" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white" style={{ background: '#2563EB' }}>
                  {(tech.initials || tech.name.split(' ').map((n) => n[0]).join('').slice(0, 2)).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{tech.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{tech.role || 'tech'}</div>
                </div>
              </div>

              {tech.currentJob ? (
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <div className="font-semibold">Now: {tech.currentJob.title}</div>
                  <div>{tech.currentJob.customer}</div>
                </div>
              ) : (
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No active job</div>
              )}

              <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Done {tech.jobsDone} / {tech.jobsToday} today
              </div>
              {tech.nextJob && (
                <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Next: {tech.nextJob.scheduledTime} · {tech.nextJob.customer}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
