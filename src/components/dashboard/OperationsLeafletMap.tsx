"use client";

import { useEffect, useMemo, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { createTrackingTileLayer, mapboxProviderLabel } from "@/lib/mapbox";

type DispatchTech = {
  id: string;
  name: string;
  initials?: string;
  status?: string;
  color?: string;
  jobsToday: number;
  jobsDone: number;
  location?: { lat: number; lng: number; timestamp: string; accuracy?: number } | null;
  currentJob?: { id: string; title: string; customer: string; address?: string } | null;
  nextJob?: { id: string; title: string; customer: string; scheduledTime: string; address?: string } | null;
};

type Job = {
  id: string;
  title: string;
  customerName: string;
  propertyAddress: string;
  scheduledTimeStart: string;
  assignedTechs: Array<{ id: string; name: string; color: string }>;
};

type Props = {
  techs: DispatchTech[];
  jobs: Job[];
};

function cleanInitials(name: string, fallback?: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (fallback) return fallback.slice(0, 2).toUpperCase();
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0] || "T").slice(0, 2).toUpperCase();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const escapes: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return escapes[char] || char;
  });
}

function markerColor(value?: string) {
  if (!value) return "#2563eb";
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^var\(--[a-z0-9-]+\)$/i.test(value) ? value : "#2563eb";
}

function markerHtml(tech: DispatchTech, active: boolean) {
  const color = active ? "var(--color-ember)" : markerColor(tech.color);
  const label = escapeHtml(cleanInitials(tech.name, tech.initials));
  const state = escapeHtml(tech.currentJob ? "On Job" : tech.status === "available" ? "Ready" : tech.status || "Tech");
  return `
    <div class="ops-map-marker ${active ? "is-active" : ""}">
      <span style="background:${color}">${label}</span>
      <strong>${state}</strong>
    </div>
  `;
}

function fallbackPositions(techs: DispatchTech[]) {
  const center = { lat: 37.2089, lng: -93.2923 };
  const offsets = [
    [0.035, -0.07],
    [0.06, -0.01],
    [0.02, 0.055],
    [-0.045, 0.04],
    [-0.06, -0.025],
    [0.005, -0.115],
    [0.08, 0.09],
    [-0.09, 0.0],
  ];

  return techs.slice(0, 8).map((tech, index) => ({
    tech,
    lat: center.lat + (offsets[index]?.[0] || 0),
    lng: center.lng + (offsets[index]?.[1] || 0),
    live: false,
  }));
}

export default function OperationsLeafletMap({ techs, jobs }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeRef = useRef<any>(null);

  const markerData = useMemo(() => {
    const live = techs
      .filter((tech) => tech.location)
      .slice(0, 8)
      .map((tech) => ({ tech, lat: tech.location!.lat, lng: tech.location!.lng, live: true }));
    return live.length ? live : fallbackPositions(techs);
  }, [techs]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapEl.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !mapEl.current) return;

      const map = L.map(mapEl.current, {
        attributionControl: false,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      }).setView([37.2089, -93.2923], 11);

      createTrackingTileLayer(L, "street").addTo(map);

      L.control.zoom({ position: "topright" }).addTo(map);
      mapRef.current = { map, L };
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
    const { map, L } = ctx;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }

    const points = markerData.map((item) => [item.lat, item.lng] as [number, number]);
    if (!points.length) {
      map.setView([37.2089, -93.2923], 11);
      return;
    }

    points.forEach((point, index) => {
      const item = markerData[index];
      const icon = L.divIcon({
        html: markerHtml(item.tech, index === 0),
        className: "ops-map-marker-shell",
        iconSize: [94, 42],
        iconAnchor: [47, 34],
      });
      const marker = L.marker(point, { icon }).addTo(map);
      marker.bindTooltip(escapeHtml(`${item.tech.name}${item.live ? " - live GPS" : " - dispatch view"}`));
      markersRef.current.push(marker);
    });

    if (points.length > 1) {
      routeRef.current = L.polyline(points, {
        color: "#ff6a00",
        weight: 4,
        opacity: 0.86,
        dashArray: "10 12",
      }).addTo(map);
    }

    if (points.length === 1) {
      map.setView(points[0], 12);
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [52, 52], maxZoom: 12 });
    }
  }, [markerData]);

  return (
    <div className="ops-map-wrap">
      <div ref={mapEl} className="ops-map-canvas" />
      <div className="ops-map-glass" />
      <div className="ops-map-topbar">
        <span>Today</span>
        <span>{mapboxProviderLabel()}</span>
        <span>{markerData.filter((item) => item.live).length} live GPS</span>
        <span>{jobs.length} jobs</span>
      </div>
      <div className="ops-map-controls">
        <span>GPS</span>
        <span>+</span>
        <span>-</span>
      </div>
    </div>
  );
}
