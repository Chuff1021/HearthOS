"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
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

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const hasAutoFitRef = useRef(false);

  function markerHtml(color: string, active: boolean) {
    const size = active ? 18 : 14;
    const ring = active ? "rgba(255,68,0,0.35)" : "rgba(37,99,235,0.30)";
    return `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${color};box-shadow:0 0 0 4px ${ring};border:2px solid #fff;"></div>`;
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

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const L = await import('leaflet');
      if (cancelled || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
      }).setView([39.5, -98.35], 4);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      }).addTo(map);

      mapRef.current = { map, L };
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current?.map) {
        mapRef.current.map.remove();
        mapRef.current = null;
        markersRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    const ctx = mapRef.current;
    if (!ctx) return;
    const { map, L } = ctx;

    const ids = new Set(liveTechs.map((t) => t.id));

    for (const [id, marker] of markersRef.current.entries()) {
      if (!ids.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    }

    for (const t of liveTechs) {
      const active = t.id === selectedTechId;
      const color = active ? '#FF4400' : '#2563EB';
      const icon = L.divIcon({ html: markerHtml(color, active), className: '', iconSize: [18, 18], iconAnchor: [9, 9] });
      const latlng: [number, number] = [t.location!.lat, t.location!.lng];

      const existing = markersRef.current.get(t.id);
      if (existing) {
        existing.setLatLng(latlng);
        existing.setIcon(icon);
      } else {
        const marker = L.marker(latlng, { icon })
          .addTo(map)
          .bindTooltip(`${t.name} (${t.location!.lat.toFixed(4)}, ${t.location!.lng.toFixed(4)})`);
        marker.on('click', () => setSelectedTechId(t.id));
        markersRef.current.set(t.id, marker);
      }
    }

    if (!hasAutoFitRef.current && liveTechs.length > 0) {
      if (liveTechs.length === 1) {
        map.setView([liveTechs[0].location!.lat, liveTechs[0].location!.lng], 13);
      } else {
        const bounds = L.latLngBounds(liveTechs.map((t) => [t.location!.lat, t.location!.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }
      hasAutoFitRef.current = true;
    }
  }, [liveTechs, selectedTechId]);

  useEffect(() => {
    const ctx = mapRef.current;
    if (!ctx || !selectedTech?.location) return;
    ctx.map.flyTo([selectedTech.location.lat, selectedTech.location.lng], Math.max(ctx.map.getZoom(), 13), { duration: 0.4 });
  }, [selectedTechId, selectedTech?.location]);

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
            <div className="h-[480px] rounded-xl overflow-hidden relative" style={{ background: '#f5f7fa', border: '1px solid var(--color-border)' }}>
              <div ref={mapContainerRef} className="absolute inset-0" />
              {liveTechs.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center" style={{ color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.75)' }}>
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
