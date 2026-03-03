"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import TechBottomNav from "@/components/tech/TechBottomNav";

interface Tech {
  id: string;
  name: string;
  color: string;
  initials: string;
  active: boolean;
}

interface Job {
  id: string;
  customerName: string;
  propertyAddress: string;
  title: string;
  scheduledDate: string;
  scheduledTimeStart: string;
  scheduledTimeEnd: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "on_hold";
  assignedTechs: Array<{ id: string; name: string; color: string }>;
}

export default function TechApp() {
  const { user } = useUser();
  const displayName = user?.firstName || user?.fullName || "Tech";

  const [isClockedIn, setIsClockedIn] = useState(false);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [clocking, setClocking] = useState(false);

  const [techs, setTechs] = useState<Tech[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [techRes, jobsRes] = await Promise.all([
        fetch("/api/techs?activeOnly=true"),
        fetch("/api/jobs?limit=500"),
      ]);
      const techData = await techRes.json();
      const jobsData = await jobsRes.json();
      const fetchedTechs: Tech[] = techData.techs || [];
      const fetchedJobs: Job[] = jobsData.jobs || [];
      setTechs(fetchedTechs);
      setJobs(fetchedJobs);

      if (fetchedTechs.length) {
        const userMatch = fetchedTechs.find((t) => displayName.toLowerCase().includes(t.name.split(" ")[0].toLowerCase()));
        setSelectedTechId((prev) => prev || userMatch?.id || fetchedTechs[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadClockState() {
      if (!selectedTechId) return;
      const res = await fetch(`/api/time/entries?techId=${selectedTechId}&openOnly=true`);
      const data = await res.json();
      setIsClockedIn((data.entries || []).length > 0);
    }
    loadClockState();
  }, [selectedTechId]);

  async function handleClockToggle() {
    if (!selectedTechId) return;
    setClocking(true);
    try {
      await fetch('/api/time/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isClockedIn ? 'clock_out' : 'clock_in',
          techId: selectedTechId,
          techName: selectedTech?.name,
        }),
      });
      setIsClockedIn((v) => !v);
    } finally {
      setClocking(false);
    }
  }

  const todaysJobs = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return jobs
      .filter((j) => j.scheduledDate === today)
      .filter((j) => (selectedTechId ? j.assignedTechs.some((t) => t.id === selectedTechId) : true))
      .sort((a, b) => a.scheduledTimeStart.localeCompare(b.scheduledTimeStart));
  }, [jobs, selectedTechId]);

  const selectedTech = techs.find((t) => t.id === selectedTechId);

  return (
    <div className="flex flex-col min-h-screen pb-20" style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}>
      <header className="p-4 sticky top-0 z-10" style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">HearthOS Tech</h1>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Welcome {displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/schedule" className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}>
              Master Schedule
            </Link>
            <div className="text-xs px-2 py-1 rounded" style={{ color: "#98CD00", border: "1px solid var(--color-border)" }}>GPS</div>
          </div>
        </div>
      </header>

      <div className="p-4 rounded-xl mx-4 mt-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>View schedule for tech</p>
            <select
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
            >
              {techs.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleClockToggle}
            disabled={clocking}
            className="px-5 py-3 rounded-xl text-sm font-semibold"
            style={{
              background: isClockedIn ? "rgba(255,32,78,0.15)" : "linear-gradient(135deg, #98CD00, #98CD00)",
              color: isClockedIn ? "#FF204E" : "#111",
              border: isClockedIn ? "1px solid rgba(255,32,78,0.5)" : "none",
            }}
          >
            {clocking ? "Saving..." : isClockedIn ? "Clock Out" : "Clock In"}
          </button>
        </div>
      </div>

      {activeJob && (
        <div className="mx-4 mt-3 p-3 rounded-xl" style={{ background: "rgba(255,68,0,0.14)", border: "1px solid rgba(255,68,0,0.45)" }}>
          <p className="text-xs" style={{ color: "#FF4400" }}>Active Job</p>
          <p className="font-semibold">{todaysJobs.find((j) => j.id === activeJob)?.customerName}</p>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Today&apos;s Jobs {selectedTech ? `· ${selectedTech.name}` : ""}</h2>
          <button onClick={loadData} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid var(--color-border)" }}>Refresh</button>
        </div>

        {loading ? (
          <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading...</div>
        ) : todaysJobs.length === 0 ? (
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)" }}>
            <p style={{ color: "var(--color-text-muted)" }}>No jobs scheduled for today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todaysJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl p-4"
                style={{
                  background: "var(--color-surface-1)",
                  border: `1px solid ${activeJob === job.id ? "#FF4400" : "var(--color-border)"}`,
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-semibold">{job.customerName}</h3>
                    <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{job.title}</p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "#2563EB" }}>
                    {job.scheduledTimeStart} - {job.scheduledTimeEnd}
                  </span>
                </div>

                <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                  {job.propertyAddress}
                </p>

                <div className="flex gap-2">
                  <Link
                    href={`/tech/job/${job.id}`}
                    className="flex-1 text-center py-2 rounded-lg text-sm font-medium"
                    style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-border)" }}
                  >
                    View Customer & Job
                  </Link>
                  <button
                    onClick={() => setActiveJob((prev) => (prev === job.id ? null : job.id))}
                    disabled={!isClockedIn}
                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{
                      background: activeJob === job.id ? "rgba(255,32,78,0.15)" : "linear-gradient(135deg, #FF4400, #FF4400)",
                      color: activeJob === job.id ? "#FF204E" : "#fff",
                      border: activeJob === job.id ? "1px solid rgba(255,32,78,0.5)" : "none",
                      opacity: isClockedIn ? 1 : 0.55,
                    }}
                  >
                    {activeJob === job.id ? "End Job" : "Start Job"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TechBottomNav active="jobs" />
    </div>
  );
}
