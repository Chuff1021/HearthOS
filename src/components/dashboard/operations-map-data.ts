export type MapTech = {
  id: string;
  name: string;
  initials?: string;
  color?: string;
  location?: { lat: number; lng: number; timestamp: string; accuracy?: number } | null;
};

export const STALE_LOCATION_MS = 30 * 60 * 1000;

export function validatedLocation(value: unknown, now: number) {
  if (!value || typeof value !== "object" || !Number.isFinite(now)) return null;
  const { lat, lng, timestamp, accuracy } = value as Record<string, unknown>;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null; // Common unset-coordinate sentinel.
  if (typeof timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) return null;
  const reportedAt = Date.parse(timestamp);
  if (!Number.isFinite(reportedAt) || reportedAt > now) return null;
  if (accuracy != null && (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0)) return null;
  return { lat, lng, timestamp, reportedAt, accuracy: typeof accuracy === "number" ? accuracy : null, stale: now - reportedAt > STALE_LOCATION_MS };
}

export function getLocationMarkers(techs: MapTech[], now: number) {
  return techs.flatMap((tech) => {
    const location = validatedLocation(tech.location, now);
    return location ? [{ tech, ...location }] : [];
  });
}

export type LocationMarker = ReturnType<typeof getLocationMarkers>[number];

export function escapeMapHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function locationLabel(marker: LocationMarker) {
  const age = marker.stale ? "Older than 30 min" : "Reported within 30 min";
  const accuracy = marker.accuracy === null ? "Accuracy unavailable" : `Accuracy +/-${Math.round(marker.accuracy)} m`;
  return `${marker.tech.name} - ${age}. Reported ${new Date(marker.reportedAt).toLocaleString()}. ${accuracy}`;
}

export function markerHtml(marker: LocationMarker) {
  const { tech, stale } = marker;
  const initials = (typeof tech.initials === "string" ? tech.initials : tech.name.trim().split(/\s+/).map((part) => part[0]).join("")).slice(0, 2).toUpperCase();
  const color = typeof tech.color === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(tech.color) ? tech.color : "#2563eb";
  return `<div class="ops-map-marker"><span style="background:${stale ? "#64748b" : color}">${escapeMapHtml(initials)}</span><strong>${stale ? "Older report" : "Reported"}</strong></div>`;
}

// Cancellation covers both unmount and Strict Mode's setup/cleanup/setup cycle.
// Publishing readiness triggers React's marker effect even if the data arrived first.
export function initializeMap<Module, Session extends { remove: () => void }>(
  load: () => Promise<Module>,
  create: (module: Module) => Session,
  ready: (session: Session) => void,
  failed: () => void,
) {
  let cancelled = false;
  let session: Session | undefined;
  void load().then((module) => {
    if (cancelled) return;
    session = create(module);
    ready(session);
  }).catch(() => { if (!cancelled) failed(); });
  return () => {
    cancelled = true;
    session?.remove();
    session = undefined;
  };
}
