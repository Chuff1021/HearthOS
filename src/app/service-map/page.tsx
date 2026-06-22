"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, Crosshair, Flame, LocateFixed, Mail, MapPinned, MessageSquare, Phone, RefreshCw, Route, Search } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { createTrackingTileLayer, hasMapboxTiles, mapboxProviderLabel } from "@/lib/mapbox";

type ServiceCategory = "gas" | "wood" | "pellet" | "unknown";
type FilterKey = "target" | "all" | "gas" | "wood" | "pellet" | "unknown";
type MapStyle = "street" | "satellite";

type ServiceMapCustomer = {
  id: string;
  qbCustomerId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  phoneAlt: string | null;
  address: string;
  zoneKey: string;
  zoneLabel: string;
  propertyId: string | null;
  lat: number | null;
  lng: number | null;
  serviceCategory: ServiceCategory;
  isTarget: boolean;
  lastServiceDate: string | null;
  serviceCount18mo: number;
  serviceCountTotal: number;
  hasServicePlan: boolean;
  scheduled: boolean;
  scheduledJobId: string | null;
  scheduledDate: string | null;
  evidence: string[];
  scheduleUrl: string;
};

type ServiceMapResponse = {
  windowMonths: number;
  cutoffDate: string;
  items: ServiceMapCustomer[];
  summaries: {
    customers: number;
    mapped: number;
    unmapped: number;
    targetCustomers: number;
    targetMapped: number;
    unscheduledTargets: number;
    scheduledTargets: number;
    gas: number;
    wood: number;
    pellet: number;
    unknown: number;
  };
};

const categoryColors: Record<ServiceCategory, string> = {
  gas: "#ff6a00",
  wood: "#7c3f1d",
  pellet: "#16a34a",
  unknown: "#64748b",
};

const statusColors = {
  scheduled: "#16a34a",
  unscheduled: "#dc2626",
};

const SPRINGFIELD_CENTER: [number, number] = [37.2089, -93.2923];
const CORE_SERVICE_RADIUS_MILES = 100;

const categoryLabels: Record<ServiceCategory, string> = {
  gas: "Gas",
  wood: "Wood",
  pellet: "Pellet",
  unknown: "Unknown",
};

const filterLabels: Record<FilterKey, string> = {
  target: "18 mo targets",
  all: "All mapped",
  gas: "Gas",
  wood: "Wood",
  pellet: "Pellet",
  unknown: "Unknown",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char] || char);
}

function relDate(value: string | null) {
  if (!value) return "No service date";
  const time = new Date(`${value}T00:00:00`).getTime();
  if (!Number.isFinite(time)) return value;
  const days = Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  if (days < 30) return `${days || 1}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ServiceMapPage() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ map: any; L: any } | null>(null);
  const tileRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const zoneRef = useRef<any>(null);
  const [data, setData] = useState<ServiceMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("target");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(1);
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [selected, setSelected] = useState<ServiceMapCustomer | null>(null);

  const loadMapData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/service-map", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load service map");
      const json = await res.json();
      setData(json);
      setSelected((current) => {
        if (!current) return null;
        return json.items.find((item: ServiceMapCustomer) => item.id === current.id) || null;
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load service map");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  const zoneOptions = useMemo(() => {
    const counts = new Map<string, { key: string; label: string; total: number; unscheduled: number }>();
    for (const item of data?.items || []) {
      if (!item.isTarget) continue;
      const key = item.zoneKey || "unknown";
      const current = counts.get(key) || { key, label: item.zoneLabel || "Unknown zone", total: 0, unscheduled: 0 };
      current.total += 1;
      if (!item.scheduled) current.unscheduled += 1;
      counts.set(key, current);
    }
    return [...counts.values()].sort((a, b) => b.unscheduled - a.unscheduled || a.label.localeCompare(b.label));
  }, [data]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || [])
      .filter((item) => item.lat != null && item.lng != null)
      .filter((item) => {
        if (filter === "all") return true;
        if (filter === "target") return item.isTarget;
        return item.isTarget && item.serviceCategory === filter;
      })
      .filter((item) => zoneFilter === "all" || item.zoneKey === zoneFilter)
      .filter((item) => {
        if (!q) return true;
        return [item.displayName, item.address, item.email, item.phone, item.serviceCategory]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [data, filter, query, zoneFilter]);

  const mapItems = useMemo(() => {
    const focused = query.trim() || zoneFilter !== "all";
    const base = focused
      ? visibleItems
      : visibleItems.filter((item) => {
          if (item.lat == null || item.lng == null) return false;
          return distanceMiles(SPRINGFIELD_CENTER, [Number(item.lat), Number(item.lng)]) <= CORE_SERVICE_RADIUS_MILES;
        });

    if (!selected || selected.lat == null || selected.lng == null || base.some((item) => item.id === selected.id)) {
      return base;
    }

    return [...base, selected];
  }, [query, selected, visibleItems, zoneFilter]);

  const callList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || [])
      .filter((item) => item.isTarget)
      .filter((item) => zoneFilter === "all" || item.zoneKey === zoneFilter)
      .filter((item) => {
        if (!q) return true;
        return [item.displayName, item.address, item.email, item.phone, item.serviceCategory]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (a.scheduled !== b.scheduled) return a.scheduled ? 1 : -1;
        const zoneCompare = a.zoneLabel.localeCompare(b.zoneLabel);
        if (zoneCompare !== 0 && zoneFilter === "all") return zoneCompare;
        if (b.serviceCount18mo !== a.serviceCount18mo) return b.serviceCount18mo - a.serviceCount18mo;
        return String(b.lastServiceDate || "").localeCompare(String(a.lastServiceDate || ""));
      });
  }, [data, query, zoneFilter]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapEl.current || mapRef.current) return;
      const L = await import("leaflet");
      await import("leaflet.markercluster");
      if (cancelled || !mapEl.current) return;

      const map = L.map(mapEl.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([37.2089, -93.2923], 10);
      map.createPane("serviceZonePane");
      map.getPane("serviceZonePane")!.style.zIndex = "650";

      tileRef.current = createTrackingTileLayer(L, "street").addTo(map);
      const clusterFactory = (L as any).markerClusterGroup;
      clusterRef.current = (
        typeof clusterFactory === "function"
          ? clusterFactory({
              showCoverageOnHover: false,
              spiderfyOnMaxZoom: true,
              disableClusteringAtZoom: 13,
              maxClusterRadius: 42,
              iconCreateFunction: (cluster: any) => {
                const children = cluster.getAllChildMarkers?.() || [];
                const scheduledCount = children.filter((marker: any) => marker.options?.serviceScheduled).length;
                const total = cluster.getChildCount();
                const needsCount = Math.max(total - scheduledCount, 0);
                const dominantColor = needsCount > 0 ? statusColors.unscheduled : statusColors.scheduled;
                const mixLabel = needsCount > 0 ? `${needsCount}` : `${scheduledCount}`;

                return L.divIcon({
                  className: "service-map-cluster-wrap",
                  html: `
                    <div class="service-map-cluster" style="--cluster-color:${dominantColor}">
                      <strong>${total}</strong>
                      <span>${needsCount > 0 ? "calls" : "set"}</span>
                      <em>${mixLabel}</em>
                    </div>
                  `,
                  iconSize: [58, 58],
                  iconAnchor: [29, 29],
                });
              },
            })
          : L.layerGroup()
      ).addTo(map);
      zoneRef.current = L.layerGroup().addTo(map);
      mapRef.current = { map, L };
      requestAnimationFrame(() => map.invalidateSize());
    }

    initMap();
    return () => {
      cancelled = true;
      if (mapRef.current?.map) {
        mapRef.current.map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const ctx = mapRef.current;
    if (!ctx) return;
    if (tileRef.current) ctx.map.removeLayer(tileRef.current);
    tileRef.current = createTrackingTileLayer(ctx.L, mapStyle).addTo(ctx.map);
  }, [mapStyle]);

  useEffect(() => {
    const ctx = mapRef.current;
    if (!ctx || !clusterRef.current || !zoneRef.current) return;
    const { L, map } = ctx;
    clusterRef.current.clearLayers();
    zoneRef.current.clearLayers();

    const markers: any[] = [];
    for (const item of mapItems) {
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const color = item.scheduled ? statusColors.scheduled : statusColors.unscheduled;
      const marker = L.marker([lat, lng], {
        serviceScheduled: item.scheduled,
        icon: L.divIcon({
          className: "service-map-marker-wrap",
          html: `<div class="service-map-marker" style="--marker-color:${color}"><span>${escapeHtml(item.displayName.slice(0, 1).toUpperCase())}</span></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      });
      marker.bindTooltip(
        `<strong>${escapeHtml(item.displayName)}</strong><br/>${item.scheduled ? "Scheduled" : "Needs contact"} - ${categoryLabels[item.serviceCategory]} - ${escapeHtml(item.zoneLabel)}`
      );
      marker.on("click", () => setSelected(item));
      markers.push(marker);
      clusterRef.current.addLayer(marker);
    }

    const zoneSource = selected?.lat && selected?.lng ? [selected] : mapItems.filter((item) => item.isTarget).slice(0, 70);
    for (const item of zoneSource) {
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      L.circle([lat, lng], {
        radius: radiusMiles * 1609.344,
        color: item.scheduled ? statusColors.scheduled : statusColors.unscheduled,
        weight: selected?.id === item.id ? 3 : 1.6,
        opacity: selected?.id === item.id ? 0.72 : 0.34,
        fillColor: item.scheduled ? statusColors.scheduled : statusColors.unscheduled,
        fillOpacity: selected?.id === item.id ? 0.12 : 0.045,
        className: "service-map-zone-ring",
      }).addTo(zoneRef.current);
    }

    if (markers.length === 1) {
      map.setView(markers[0].getLatLng(), 12);
    } else if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map((marker) => marker.getLatLng()));
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 12 });
    }
  }, [mapItems, radiusMiles, selected]);

  async function geocodeMissing() {
    setGeocoding(true);
    setMessage(null);
    try {
      const customerIds = (data?.items || [])
        .filter((item) => item.isTarget && (item.lat == null || item.lng == null))
        .map((item) => item.id)
        .slice(0, 100);
      if (customerIds.length === 0) {
        setMessage("All target service customers with usable addresses are already mapped.");
        return;
      }
      const res = await fetch("/api/service-map/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100, customerIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Geocoding failed");
      setMessage(`Geocoded ${json.created + json.updated} customers. ${json.remaining} address records still need coordinates.`);
      await loadMapData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  }

  const summary = data?.summaries;
  const selectedZoneCount = selected
    ? visibleItems.filter((item) => {
        if (item.lat == null || item.lng == null || selected.lat == null || selected.lng == null) return false;
        return distanceMiles([Number(selected.lat), Number(selected.lng)], [Number(item.lat), Number(item.lng)]) <= radiusMiles;
      }).length
    : visibleItems.filter((item) => item.isTarget).length;

  return (
    <div className="app-chrome flex h-screen overflow-hidden">
      <Sidebar />
      <div className="liquid-dashboard flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "#ff6a00" }}>
                Internal CRM marketing
              </p>
              <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Service Marketing Map
              </h1>
              <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--color-text-muted)" }}>
                Target gas, wood, and pellet service customers with qualifying service activity in the last {data?.windowMonths || 18} months.
                Radius zones show where to market nearby, not confirmed neighbor fireplaces.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={loadMapData} className="glass-chip inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold">
                <RefreshCw size={15} /> Refresh
              </button>
              <button
                onClick={geocodeMissing}
                disabled={geocoding}
                className="btn-ember inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <LocateFixed size={15} /> {geocoding ? "Geocoding..." : "Geocode missing"}
              </button>
            </div>
          </div>

          <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Metric label="Need calls" value={summary?.unscheduledTargets ?? 0} sub="red pins not scheduled" accent={statusColors.unscheduled} />
            <Metric label="Scheduled" value={summary?.scheduledTargets ?? 0} sub="green pins on calendar" accent={statusColors.scheduled} />
            <Metric label="Gas" value={summary?.gas ?? 0} sub="recent service customers" accent={categoryColors.gas} />
            <Metric label="Wood" value={summary?.wood ?? 0} sub="recent service customers" accent={categoryColors.wood} />
            <Metric label="Pellet" value={summary?.pellet ?? 0} sub="recent service customers" accent={categoryColors.pellet} />
          </section>

          {message && (
            <div className="glass-chip mb-4 rounded-2xl px-4 py-3 text-sm" style={{ color: "var(--color-text-primary)" }}>
              {message}
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="glass-panel rounded-[1.8rem] p-4">
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className="map-glass-chip rounded-2xl px-3 py-2 text-xs font-semibold transition"
                      style={{
                        color: filter === key ? "#fff" : "var(--color-text-secondary)",
                        background: filter === key ? "linear-gradient(135deg, #ff7a1a, #f15b00)" : undefined,
                        boxShadow: filter === key ? "0 12px 26px rgba(255,106,0,0.24), inset 0 1px 0 rgba(255,255,255,0.42)" : undefined,
                      }}
                    >
                      {filterLabels[key]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={zoneFilter}
                    onChange={(event) => setZoneFilter(event.target.value)}
                    className="map-glass-chip rounded-2xl px-3 py-2 text-xs font-semibold outline-none"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    <option value="all">All zones</option>
                    {zoneOptions.map((zone) => (
                      <option key={zone.key} value={zone.key}>
                        {zone.label} - {zone.unscheduled} calls
                      </option>
                    ))}
                  </select>
                  <div className="map-glass-chip flex items-center gap-2 rounded-2xl px-3 py-2">
                    <Search size={15} style={{ color: "var(--color-text-muted)" }} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search customers, address, phone..."
                      className="w-[240px] bg-transparent text-sm outline-none"
                      style={{ color: "var(--color-text-primary)" }}
                    />
                  </div>
                  <Segmented value={radiusMiles} onChange={setRadiusMiles} values={[0.5, 1, 2]} suffix="mi" />
                  <div className="inline-flex overflow-hidden rounded-2xl map-glass-chip p-1">
                    <button onClick={() => setMapStyle("street")} className="rounded-xl px-3 py-1.5 text-xs font-semibold" style={{ background: mapStyle === "street" ? "linear-gradient(135deg, #ff7a1a, #f15b00)" : "transparent", color: mapStyle === "street" ? "#fff" : "var(--color-text-secondary)" }}>Nav</button>
                    <button onClick={() => setMapStyle("satellite")} className="rounded-xl px-3 py-1.5 text-xs font-semibold" style={{ background: mapStyle === "satellite" ? "linear-gradient(135deg, #ff7a1a, #f15b00)" : "transparent", color: mapStyle === "satellite" ? "#fff" : "var(--color-text-secondary)" }}>Sat</button>
                  </div>
                </div>
              </div>

              <div className="premium-tracking-map liquid-map-stage relative h-[610px] overflow-hidden rounded-[1.7rem]">
                <div ref={mapEl} className="absolute inset-0 ops-map-canvas" />
                <div className="ops-map-glass" />
                <div className="ops-map-topbar">
                  <span className="map-glass-chip">{mapboxProviderLabel()}</span>
                  <span className="map-glass-chip">{hasMapboxTiles() ? "customer targeting" : "fallback tiles"}</span>
                  <span className="map-glass-chip">{mapItems.length} map pins</span>
                  {visibleItems.length > mapItems.length && (
                    <span className="map-glass-chip">{visibleItems.length - mapItems.length} outside core</span>
                  )}
                  <span className="map-glass-chip"><span className="inline-block h-2 w-2 rounded-full bg-red-600" /> red needs call</span>
                  <span className="map-glass-chip"><span className="inline-block h-2 w-2 rounded-full bg-green-600" /> green scheduled</span>
                </div>
                <div className="service-map-zone-panel">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#f15b00" }}>Top Zones</span>
                    <button onClick={() => setZoneFilter("all")} className="text-[10px] font-bold" style={{ color: "var(--color-text-muted)" }}>All</button>
                  </div>
                  <div className="grid gap-1.5">
                    {zoneOptions.slice(0, 6).map((zone) => (
                      <button
                        key={zone.key}
                        onClick={() => setZoneFilter(zone.key)}
                        className="service-map-zone-row"
                        style={{
                          borderColor: zoneFilter === zone.key ? "rgba(255,106,0,0.42)" : undefined,
                          background: zoneFilter === zone.key ? "rgba(255,106,0,0.12)" : undefined,
                        }}
                      >
                        <strong>{zone.label}</strong>
                        <span>{zone.unscheduled} calls · {zone.total} homes</span>
                      </button>
                    ))}
                  </div>
                </div>
                {loading && (
                  <div className="absolute inset-0 z-[430] flex items-center justify-center bg-white/55 text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
                    Loading service map...
                  </div>
                )}
              </div>
            </section>

            <aside className="flex flex-col gap-4">
              <section className="glass-panel rounded-[1.8rem] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Call List</h2>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      Grouped by zone for assistant outreach and scheduling.
                    </p>
                  </div>
                  <div className="glass-icon">
                    <Route size={17} color="#ff6a00" />
                  </div>
                </div>
                <div className="mt-4 max-h-[350px] space-y-2 overflow-y-auto pr-1">
                  {callList.slice(0, 50).map((item) => (
                    <div
                      key={item.id}
                      className="glass-row w-full rounded-2xl p-3 text-left transition hover:translate-y-[-1px]"
                    >
                      <button onClick={() => setSelected(item)} className="flex w-full items-start gap-3 text-left">
                        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: item.scheduled ? statusColors.scheduled : statusColors.unscheduled }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{item.displayName}</span>
                          <span className="mt-0.5 block text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {item.zoneLabel} - {categoryLabels[item.serviceCategory]} - last {relDate(item.lastServiceDate)}
                          </span>
                        </span>
                        <span className="text-xs font-semibold" style={{ color: item.scheduled ? statusColors.scheduled : statusColors.unscheduled }}>
                          {item.scheduled ? "Scheduled" : "Call"}
                        </span>
                      </button>
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        <Action href={item.phone ? `tel:${item.phone}` : undefined} label="Call" icon={<Phone size={14} />} />
                        <Action href={item.phone ? `sms:${item.phone}` : undefined} label="Text" icon={<MessageSquare size={14} />} />
                        <Action href={item.email ? `mailto:${item.email}` : undefined} label="Email" icon={<Mail size={14} />} />
                        <Link href={item.scheduleUrl} className="rounded-xl px-2 py-1.5 text-center text-xs font-semibold" style={{ background: "rgba(255,106,0,0.14)", color: "#c2410c", border: "1px solid rgba(255,106,0,0.22)" }}>
                          Schedule
                        </Link>
                      </div>
                    </div>
                  ))}
                  {callList.length === 0 && (
                    <div className="rounded-2xl p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No recent service customers match this search.
                    </div>
                  )}
                </div>
              </section>

              <section className="glass-panel rounded-[1.8rem] p-4">
                {selected ? (
                  <CustomerDrawer customer={selected} zoneCount={selectedZoneCount} radiusMiles={radiusMiles} />
                ) : (
                  <div>
                    <div className="glass-icon mb-4">
                      <Crosshair size={18} color="#ff6a00" />
                    </div>
                    <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>Target Zone</h2>
                    <p className="mt-1 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                      Select a customer pin or contact-list row to inspect their service history, outreach options, and neighborhood radius. Red pins need contact; green pins already have service scheduled.
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: number; sub: string; accent: string }) {
  return (
    <div className="liquid-metric glass-card rounded-3xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
          <p className="mono-number mt-2 text-2xl font-semibold" style={{ color: accent }}>{value.toLocaleString()}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{sub}</p>
        </div>
        <div className="glass-icon">
          <Flame size={17} color={accent} />
        </div>
      </div>
    </div>
  );
}

function Segmented({ value, onChange, values, suffix }: { value: number; onChange: (value: number) => void; values: number[]; suffix: string }) {
  return (
    <div className="inline-flex overflow-hidden rounded-2xl map-glass-chip p-1">
      {values.map((item) => (
        <button
          key={item}
          onClick={() => onChange(item)}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold"
          style={{
            background: value === item ? "linear-gradient(135deg, #ff7a1a, #f15b00)" : "transparent",
            color: value === item ? "#fff" : "var(--color-text-secondary)",
          }}
        >
          {item}{suffix}
        </button>
      ))}
    </div>
  );
}

function CustomerDrawer({ customer, zoneCount, radiusMiles }: { customer: ServiceMapCustomer; zoneCount: number; radiusMiles: number }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: customer.scheduled ? statusColors.scheduled : statusColors.unscheduled }}>
            {customer.scheduled ? "Scheduled" : "Needs outreach"} - {categoryLabels[customer.serviceCategory]} - {customer.zoneLabel}
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>{customer.displayName}</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>{customer.address || "No address on file"}</p>
        </div>
        <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: customer.scheduled ? statusColors.scheduled : statusColors.unscheduled }} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Info label="Last service" value={formatDate(customer.lastServiceDate)} />
        <Info label="Status" value={customer.scheduled ? `Scheduled ${formatDate(customer.scheduledDate)}` : "Needs contact"} />
        <Info label="Recent jobs" value={`${customer.serviceCount18mo} in 18 mo`} />
        <Info label="Zone targets" value={`${zoneCount} in ${radiusMiles}mi`} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Action href={customer.phone ? `tel:${customer.phone}` : undefined} label="Call" icon={<Phone size={14} />} />
        <Action href={customer.phone ? `sms:${customer.phone}` : undefined} label="Text" icon={<MessageSquare size={14} />} />
        <Action href={customer.email ? `mailto:${customer.email}` : undefined} label="Email" icon={<Mail size={14} />} />
      </div>

      <div className="mt-4 rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.34)", border: "1px solid rgba(255,255,255,0.72)" }}>
        <p className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>Evidence</p>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
          {customer.evidence.length ? customer.evidence.join(", ") : "Recent service activity detected."}
        </p>
      </div>

      <Link href={customer.scheduleUrl} className="btn-ember mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white">
        {customer.scheduled ? <CheckCircle2 size={16} /> : <MapPinned size={16} />} {customer.scheduled ? "Open scheduler" : "Schedule service"}
      </Link>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-nested rounded-2xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{value}</p>
    </div>
  );
}

function Action({ href, label, icon }: { href?: string; label: string; icon: ReactNode }) {
  const className = "inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-semibold";
  const style = {
    background: href ? "rgba(255,255,255,0.46)" : "rgba(148,163,184,0.12)",
    border: "1px solid rgba(255,255,255,0.68)",
    color: href ? "var(--color-text-primary)" : "var(--color-text-muted)",
  };
  if (!href) {
    return <span className={className} style={style}>{icon}{label}</span>;
  }
  return (
    <a href={href} className={className} style={style}>
      {icon}{label}
    </a>
  );
}

function distanceMiles(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
