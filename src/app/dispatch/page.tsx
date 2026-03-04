"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

type Tech = {
  id: string;
  name: string;
  color: string;
  initials: string;
  status: string;
  currentJob: { id: string; title: string; customer: string; address: string } | null;
  nextJob: { id: string; title: string; customer: string; address?: string; scheduledTime: string } | null;
  jobsToday: number;
  jobsDone: number;
  location?: { lat: number; lng: number; accuracy?: number; timestamp: string; techName?: string } | null;
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
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street');
  const [selectedRouteEtaMin, setSelectedRouteEtaMin] = useState<number | null>(null);
  const [selectedOffRouteMiles, setSelectedOffRouteMiles] = useState<number | null>(null);

  const selectedTech = techs.find((t) => t.id === selectedTechId);
  const liveTechs = techs.filter((t) => t.location);
  const selectedLocation = selectedTech?.location || liveTechs[0]?.location || null;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const tileLayerRef = useRef<any>(null);
  const clusterLayerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const geocodeCacheRef = useRef<Map<string, [number, number]>>(new Map());
  const hasAutoFitRef = useRef(false);

  function cleanTechName(name: string) {
    return (name || '').replace(/\bservice\s*tech(?:nician)?\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  }

  function displayTechName(t: Tech) {
    const fromRecord = cleanTechName(t.name);
    if (fromRecord) return fromRecord;
    const fromGps = cleanTechName(t.location?.techName || '');
    if (fromGps) return fromGps;
    return t.name || t.id;
  }

  function deriveInitials(name: string, fallback?: string) {
    const cleaned = cleanTechName(name || '');
    const tokens = cleaned.split(' ').filter(Boolean);
    if (tokens.length >= 2) return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
    if (tokens.length === 1 && tokens[0].length >= 2) return tokens[0].slice(0, 2).toUpperCase();
    return (fallback || '?').slice(0, 2).toUpperCase();
  }

  function markerHtml(color: string, active: boolean, initials: string) {
    const size = active ? 26 : 22;
    const ring = active ? "rgba(255,68,0,0.35)" : "rgba(37,99,235,0.30)";
    return `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${color};box-shadow:0 0 0 4px ${ring};border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;font-family:system-ui;">${(initials || '?').slice(0,2).toUpperCase()}</div>`;
  }

  function haversineMiles(a: [number, number], b: [number, number]) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function pointToSegmentMiles(p: [number, number], a: [number, number], b: [number, number]) {
    const ax = a[1], ay = a[0];
    const bx = b[1], by = b[0];
    const px = p[1], py = p[0];
    const dx = bx - ax;
    const dy = by - ay;
    const mag2 = dx * dx + dy * dy;
    if (mag2 < 1e-12) return haversineMiles(p, a);
    let t = ((px - ax) * dx + (py - ay) * dy) / mag2;
    t = Math.max(0, Math.min(1, t));
    const proj: [number, number] = [ay + t * dy, ax + t * dx];
    return haversineMiles(p, proj);
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
      await import('leaflet.markercluster');
      if (cancelled || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
      }).setView([39.5, -98.35], 4);

      const initialTile = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      }).addTo(map);

      tileLayerRef.current = initialTile;
      const clusterGroup = (L as any).markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 15,
      });
      clusterGroup.addTo(map);
      clusterLayerRef.current = clusterGroup;
      mapRef.current = { map, L };
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current?.map) {
        mapRef.current.map.remove();
        mapRef.current = null;
        markersRef.current.clear();
        tileLayerRef.current = null;
        clusterLayerRef.current = null;
        routeLineRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const ctx = mapRef.current;
    if (!ctx) return;
    const { map, L } = ctx;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const nextTile = mapStyle === 'satellite'
      ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 20,
          attribution: 'Tiles &copy; Esri',
        })
      : L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 20,
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        });

    nextTile.addTo(map);
    tileLayerRef.current = nextTile;
  }, [mapStyle]);

  useEffect(() => {
    const ctx = mapRef.current;
    if (!ctx) return;
    const { map, L } = ctx;
    const cluster = clusterLayerRef.current;
    if (!cluster) return;

    const ids = new Set(liveTechs.map((t) => t.id));

    for (const [id, marker] of markersRef.current.entries()) {
      if (!ids.has(id)) {
        cluster.removeLayer(marker);
        markersRef.current.delete(id);
      }
    }

    for (const t of liveTechs) {
      const active = t.id === selectedTechId;
      const color = active ? '#FF4400' : '#2563EB';
      const initials = deriveInitials(displayTechName(t), t.initials);
      const icon = L.divIcon({ html: markerHtml(color, active, initials), className: '', iconSize: [26, 26], iconAnchor: [13, 13] });
      const latlng: [number, number] = [t.location!.lat, t.location!.lng];

      const existing = markersRef.current.get(t.id);
      if (existing) {
        existing.setLatLng(latlng);
        existing.setIcon(icon);
      } else {
        const marker = L.marker(latlng, { icon })
          .bindTooltip(`${displayTechName(t)} (${t.location!.lat.toFixed(4)}, ${t.location!.lng.toFixed(4)})`);
        cluster.addLayer(marker);
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

  useEffect(() => {
    const ctx = mapRef.current;
    if (!ctx) return;
    const { map, L } = ctx;

    async function drawRouteToNextJob() {
      if (routeLineRef.current) {
        map.removeLayer(routeLineRef.current);
        routeLineRef.current = null;
      }
      setSelectedRouteEtaMin(null);
      setSelectedOffRouteMiles(null);

      if (!selectedTech?.location || !selectedTech?.nextJob?.address) return;

      const address = selectedTech.nextJob.address.trim();
      if (!address) return;

      let dest = geocodeCacheRef.current.get(address);
      if (!dest) {
        try {
          const q = encodeURIComponent(address);
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}`);
          const rows = await res.json();
          if (Array.isArray(rows) && rows[0]?.lat && rows[0]?.lon) {
            dest = [Number(rows[0].lat), Number(rows[0].lon)];
            geocodeCacheRef.current.set(address, dest);
          }
        } catch {
          return;
        }
      }

      if (!dest) return;

      const current: [number, number] = [selectedTech.location.lat, selectedTech.location.lng];
      const milesToNext = haversineMiles(current, dest);
      const avgMph = 35;
      setSelectedRouteEtaMin(Math.max(1, Math.round((milesToNext / avgMph) * 60)));

      if (selectedTech.currentJob?.address) {
        const startAddress = selectedTech.currentJob.address.trim();
        let start = geocodeCacheRef.current.get(startAddress);
        if (!start && startAddress) {
          try {
            const qStart = encodeURIComponent(startAddress);
            const resStart = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${qStart}`);
            const rowsStart = await resStart.json();
            if (Array.isArray(rowsStart) && rowsStart[0]?.lat && rowsStart[0]?.lon) {
              start = [Number(rowsStart[0].lat), Number(rowsStart[0].lon)];
              geocodeCacheRef.current.set(startAddress, start);
            }
          } catch {
            // ignore start geocode failures
          }
        }
        if (start) {
          setSelectedOffRouteMiles(pointToSegmentMiles(current, start, dest));
        }
      }

      routeLineRef.current = L.polyline(
        [
          current,
          dest,
        ],
        { color: '#FF4400', weight: 3, opacity: 0.8, dashArray: '8 6' }
      ).addTo(map);
    }

    drawRouteToNextJob();
  }, [selectedTechId, selectedTech?.location?.lat, selectedTech?.location?.lng, selectedTech?.nextJob?.address]);

  function centerOnSelectedTech() {
    const ctx = mapRef.current;
    if (!ctx || !selectedTech?.location) return;
    ctx.map.flyTo([selectedTech.location.lat, selectedTech.location.lng], Math.max(ctx.map.getZoom(), 14), { duration: 0.35 });
  }

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
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Dispatch Map (Live GPS)</h2>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  <button onClick={() => setMapStyle('street')} className="px-2.5 py-1 text-xs" style={{ background: mapStyle === 'street' ? '#2563EB' : 'var(--color-surface-3)', color: mapStyle === 'street' ? '#fff' : 'var(--color-text-secondary)' }}>Street</button>
                  <button onClick={() => setMapStyle('satellite')} className="px-2.5 py-1 text-xs" style={{ background: mapStyle === 'satellite' ? '#2563EB' : 'var(--color-surface-3)', color: mapStyle === 'satellite' ? '#fff' : 'var(--color-text-secondary)' }}>Satellite</button>
                </div>
                <button
                  onClick={centerOnSelectedTech}
                  disabled={!selectedTech?.location}
                  className="px-2.5 py-1 rounded-lg text-xs disabled:opacity-50"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  Center on tech
                </button>
              </div>
            </div>
            <div className="h-[480px] rounded-xl overflow-hidden relative" style={{ background: '#f5f7fa', border: '1px solid var(--color-border)' }}>
              <div ref={mapContainerRef} className="absolute inset-0" />
              {liveTechs.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center" style={{ color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.75)' }}>
                  No live GPS ping yet. Open Tech Profile on phone, allow location, tap Register Me as Tech, and keep tracking enabled.
                </div>
              )}
            </div>
            {selectedLocation && (
              <div className="mt-2 text-xs space-y-1" style={{ color: 'var(--color-text-muted)' }}>
                <div>
                  Tracking: {selectedTech ? displayTechName(selectedTech) : 'Live Tech'} @ {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
                </div>
                <div>
                  {selectedTech?.nextJob?.address ? `Route line to next job: ${selectedTech.nextJob.address}` : 'No next-job route available'}
                  {selectedRouteEtaMin ? ` · ETA ~ ${selectedRouteEtaMin} min` : ''}
                </div>
                {selectedOffRouteMiles !== null && selectedOffRouteMiles > 2 && (
                  <div className="inline-block px-2 py-0.5 rounded" style={{ background: 'rgba(255,32,78,0.14)', border: '1px solid rgba(255,32,78,0.35)', color: '#FF204E' }}>
                    Geofence alert: ~{selectedOffRouteMiles.toFixed(1)} mi off planned line
                  </div>
                )}
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
                  <option key={t.id} value={t.id}>{displayTechName(t)} ({t.jobsDone}/{t.jobsToday})</option>
                ))}
              </select>
              <div className="mt-3 space-y-1 max-h-40 overflow-auto">
                {techs.map((t) => (
                  <div key={t.id} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>{displayTechName(t)}:</span>{' '}
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
                    <div className="text-xs font-semibold">{displayTechName(t)}</div>
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
