"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { LocateFixed, Minus, Plus, RefreshCw } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { createTrackingTileLayer, hasMapboxTiles } from "@/lib/mapbox";
import { escapeMapHtml, getLocationMarkers, initializeMap, locationLabel, markerHtml, type LocationMarker, type MapTech } from "./operations-map-data";

type MapContext = {
  map: LeafletMap;
  L: typeof import("leaflet");
  markers: LayerGroup;
  disposed: boolean;
  remove: () => void;
};

function fitLocations(map: LeafletMap, markers: LocationMarker[]) {
  const points = markers.map(({ lat, lng }) => [lat, lng] as [number, number]);
  if (points.length === 1) map.setView(points[0], 12);
  else if (points.length) map.fitBounds(points, { padding: [60, 80], maxZoom: 12 });
}

export default function OperationsLeafletMap({ techs, now }: { techs: MapTech[]; now: number }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const [context, setContext] = useState<MapContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fittedContext = useRef<MapContext | null>(null);
  const markerData = useMemo(() => getLocationMarkers(techs, now), [techs, now]);
  const hasLocations = markerData.length > 0;

  useEffect(() => {
    const element = mapEl.current;
    if (!element || !hasLocations) return;
    return initializeMap<typeof import("leaflet"), MapContext>(
      () => import("leaflet"),
      (L): MapContext => {
        const map = L.map(element, { attributionControl: true, zoomControl: false, scrollWheelZoom: false });
        let observer: ResizeObserver | null = null;
        try {
          const tiles = createTrackingTileLayer(L, "street");
          tiles.options.attribution = hasMapboxTiles()
            ? '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> <a href="https://www.mapbox.com/map-feedback/">Improve this map</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
          const session: MapContext = { map, L, markers: L.layerGroup().addTo(map), disposed: false, remove: () => {
            session.disposed = true;
            observer?.disconnect();
            map.remove();
          } };
          observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.invalidateSize());
          observer?.observe(element);
          tiles.on("tileerror", () => { if (!session.disposed) setError("Some map tiles are unavailable."); });
          tiles.addTo(map);
          return session;
        } catch (cause) {
          observer?.disconnect();
          map.remove();
          throw cause;
        }
      },
      setContext,
      () => setError("Map unavailable."),
    );
  }, [hasLocations, attempt]);

  useEffect(() => {
    if (!context || context.disposed) return;
    const { map, L, markers } = context;
    markers.clearLayers();
    markerData.forEach((item) => {
      const label = locationLabel(item);
      const marker = L.marker([item.lat, item.lng], {
        icon: L.divIcon({ html: markerHtml(item), className: "ops-map-marker-shell", iconSize: [110, 42], iconAnchor: [55, 34] }),
        title: label,
        alt: label,
        opacity: item.stale ? 0.7 : 1,
      }).addTo(markers);
      marker.bindTooltip(escapeMapHtml(label));
    });
    // Age updates must not reset a user's view; fit again only on explicit request.
    if (fittedContext.current !== context && markerData.length) {
      fitLocations(map, markerData);
      fittedContext.current = context;
    }
  }, [context, markerData]);

  const ready = Boolean(context && !context.disposed);
  const staleCount = markerData.filter((item) => item.stale).length;
  return (
    <div className="ops-map-wrap">
      {hasLocations ? <>
        <div ref={mapEl} className="ops-map-canvas" role="region" aria-label="Last-reported technician locations" />
        <div className="pointer-events-none absolute left-3 right-16 top-3 z-[450]">
          <p className="w-fit rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-700" role="status">
            {markerData.length} last-reported locations - {staleCount} older than 30 min
            {!ready && !error && <span className="mt-1 block">Loading map...</span>}
          </p>
          {error && <div className="pointer-events-auto mt-2 flex items-center gap-2 rounded-lg bg-white/95 p-2 text-xs text-slate-700" role="alert">
            <span>{error}</span>
            <button type="button" className="glass-icon shrink-0" aria-label="Retry map" title="Retry map" onClick={() => { setError(null); setContext(null); setAttempt((value) => value + 1); }}><RefreshCw size={16} /></button>
          </div>}
        </div>
        <div className="absolute right-3 top-3 z-[450] grid gap-2">
          <button type="button" className="glass-icon bg-white" title="Zoom in" aria-label="Zoom in" disabled={!ready} onClick={() => context?.map.zoomIn()}><Plus size={18} /></button>
          <button type="button" className="glass-icon bg-white" title="Zoom out" aria-label="Zoom out" disabled={!ready} onClick={() => context?.map.zoomOut()}><Minus size={18} /></button>
          <button type="button" className="glass-icon bg-white" title="Fit reported locations" aria-label="Fit reported locations" disabled={!ready} onClick={() => { if (context) fitLocations(context.map, markerData); }}><LocateFixed size={18} /></button>
        </div>
      </> : <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm" role="status">
        No valid reported locations available. {techs.length} technicians in this dispatch snapshot.
      </div>}
    </div>
  );
}
