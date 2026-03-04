"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = "lead" | "quoted" | "approved" | "ordered" | "scheduled" | "installed";

const STAGES: Stage[] = ["lead", "quoted", "approved", "ordered", "scheduled", "installed"];

export default function SalesFunnel() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [jRes, eRes] = await Promise.all([
          fetch('/api/jobs?limit=300', { cache: 'no-store' }),
          fetch('/api/estimates', { cache: 'no-store' }),
        ]);
        const [jData, eData] = await Promise.all([jRes.json(), eRes.json()]);
        setJobs(jData.jobs || []);
        setEstimates(eData.estimates || []);
      } catch {
        setJobs([]);
        setEstimates([]);
      }
    })();
  }, []);

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { lead: 0, quoted: 0, approved: 0, ordered: 0, scheduled: 0, installed: 0 };
    c.quoted = estimates.length;
    c.scheduled = jobs.filter((j) => j.status === 'scheduled').length;
    c.installed = jobs.filter((j) => j.status === 'completed').length;
    c.approved = jobs.filter((j) => j.priority === 'high').length;
    c.ordered = jobs.filter((j) => j.jobType === 'installation').length;
    c.lead = Math.max(0, c.quoted - c.approved);
    return c;
  }, [jobs, estimates]);

  const total = STAGES.reduce((sum, s) => sum + counts[s], 0);

  return (
    <div className="rounded-xl p-5" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
      <div className="mb-4">
        <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Sales Pipeline</h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Derived from real estimates/jobs (no seeded demo projects)</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {STAGES.map((stage) => (
          <div key={stage} className="rounded-lg p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <div className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>{stage}</div>
            <div className="text-xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{counts[stage]}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Total tracked opportunities: {total}
      </div>
    </div>
  );
}
