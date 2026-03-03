"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Tech = {
  id: string;
  name: string;
  color: string;
  initials: string;
  status: string;
  currentJob: { id: string; title: string; customer: string; address: string } | null;
  nextJob: { id: string; title: string; customer: string; scheduledTime: string } | null;
  jobsToday: number;
  jobsDone: number;
  location?: { lat: number; lng: number; accuracy?: number; timestamp: string } | null;
};

type UnassignedJob = {
  id: string;
  title: string;
  customer: string;
  address: string;
  scheduledTime: string;
  priority: string;
};

export default function DispatchPage() {
  const [techs, setTechs] = useState<Tech[]>([]);
  const [unassignedJobs, setUnassignedJobs] = useState<UnassignedJob[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [gpsDebug, setGpsDebug] = useState<{ latestLocationCount: number; unmappedLiveCount: number } | null>(null);

  const selectedTech = techs.find((t) => t.id === selectedTechId);
  const liveTechs = techs.filter((t) => t.location);
  const selectedLocation = selectedTech?.location || liveTechs[0]?.location || null;

  const lats = liveTechs.map((t) => t.location!.lat);
  const lngs = liveTechs.map((t) => t.location!.lng);
  const minLat = lats.length ? Math.min(...lats) : 0;
  const maxLat = lats.length ? Math.max(...lats) : 1;
  const minLng = lngs.length ? Math.min(...lngs) : 0;
  const maxLng = lngs.length ? Math.max(...lngs) : 1;

  function markerPos(lat: number, lng: number) {
    const lngSpan = maxLng - minLng;
    const latSpan = maxLat - minLat;

    if (Math.abs(lngSpan) < 0.000001 && Math.abs(latSpan) < 0.000001) {
      return { left: '50%', top: '50%' };
    }

    const x = ((lng - minLng) / Math.max(0.00001, lngSpan)) * 100;
    const y = (1 - (lat - minLat) / Math.max(0.00001, latSpan)) * 100;
    return { left: `${Math.min(98, Math.max(2, x))}%`, top: `${Math.min(98, Math.max(2, y))}%` };
  }

  async function loadDispatch() {
    setLoading(true);
    try {
      const res = await fetch('/api/dispatch?activeOnly=true', { cache: 'no-store' });
      const data = await res.json();
      setTechs(data.techs || []);
      setUnassignedJobs(data.unassignedJobs || []);
      setGpsDebug(data.gpsDebug || null);
      if (!selectedTechId && data.techs?.length) setSelectedTechId(data.techs[0].id);
    } finally {
      setLoading(false);
    }
  }

  async function assignJob(jobId: string) {
    if (!selectedTechId) return;
    await fetch('/api/dispatch', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign', techId: selectedTechId, jobId }),
    });
    await loadDispatch();
  }

  useEffect(() => {
    loadDispatch();
    const t = setInterval(loadDispatch, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h1 className="font-bold text-xl" style={{ color: 'var(--color-text-primary)' }}>Dispatch</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {loading ? 'Loading dispatch...' : `${techs.length} techs active · ${unassignedJobs.length} unassigned jobs`}
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Build: dispatch-fix-2026-03-03-2230</p>
            {gpsDebug && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                GPS pings: {gpsDebug.latestLocationCount} · Unmapped live: {gpsDebug.unmappedLiveCount}
              </p>
            )}
          </div>
          <button onClick={loadDispatch} className="px-3 py-1.5 rounded-lg text-sm" style={{ border: '1px solid var(--color-border)' }}>Refresh</button>
        </div>

        <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 p-6 overflow-y-auto">
          <div className="xl:col-span-2 rounded-xl p-5" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
            <h2 className="font-semibold mb-3">Dispatch Map (Live GPS)</h2>
            <div className="h-[480px] rounded-xl overflow-hidden relative" style={{ background: 'linear-gradient(180deg, #0b1220 0%, #111b2f 100%)', border: '1px solid var(--color-border)' }}>
              {liveTechs.length > 0 ? (
                <>
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(rgba(148,163,184,0.16) 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                    opacity: 0.35,
                  }} />
                  {liveTechs.map((t) => {
                    const pos = markerPos(t.location!.lat, t.location!.lng);
                    const active = t.id === selectedTechId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTechId(t.id)}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ ...pos, width: active ? 18 : 14, height: active ? 18 : 14, background: active ? '#FF4400' : '#2563EB', boxShadow: '0 0 0 4px rgba(37,99,235,0.22)' }}
                        title={`${t.name} (${t.location!.lat.toFixed(4)}, ${t.location!.lng.toFixed(4)})`}
                      />
                    );
                  })}
                </>
              ) : (
                <div className="h-full flex items-center justify-center px-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  No live GPS ping yet. Open Tech Profile on phone, allow location, tap Register Me as Tech, and keep tracking enabled.
                </div>
              )}
            </div>
            {selectedLocation && (
              <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Tracking: {selectedTech?.name || 'Live Tech'} @ {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-2">Assign To Tech</h3>
              <select
                value={selectedTechId}
                onChange={(e) => setSelectedTechId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}
              >
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.jobsDone}/{t.jobsToday})</option>
                ))}
              </select>
              <div className="mt-3 space-y-1 max-h-40 overflow-auto">
                {techs.map((t) => (
                  <div key={t.id} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.name}:</span>{' '}
                    {t.location ? `${t.location.lat.toFixed(4)}, ${t.location.lng.toFixed(4)} (±${Math.round(t.location.accuracy || 0)}m)` : 'No GPS ping yet'}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-2">Live GPS Feed</h3>
              <div className="space-y-2 max-h-36 overflow-auto">
                {liveTechs.length > 0 ? liveTechs.map((t) => (
                  <div key={`gps-${t.id}`} className="p-2 rounded-lg" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}>
                    <div className="text-xs font-semibold">{t.name}</div>
                    <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {t.location!.lat.toFixed(5)}, {t.location!.lng.toFixed(5)} · ±{Math.round(t.location!.accuracy || 0)}m
                    </div>
                    <a
                      href={`https://maps.apple.com/?ll=${t.location!.lat},${t.location!.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px]"
                      style={{ color: '#2563EB' }}
                    >
                      Open in Maps
                    </a>
                  </div>
                )) : <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No live pings yet.</p>}
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold mb-2">Unassigned Jobs</h3>
              <div className="space-y-2 max-h-[460px] overflow-auto pr-1">
                {unassignedJobs.map((job) => (
                  <div key={job.id} className="p-3 rounded-lg" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}>
                    <div className="text-sm font-semibold">{job.title}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{job.customer} · {job.scheduledTime}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{job.address}</div>
                    <button onClick={() => assignJob(job.id)} className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: '#2563EB' }}>
                      Assign to Selected Tech
                    </button>
                  </div>
                ))}
                {unassignedJobs.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No unassigned jobs.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
