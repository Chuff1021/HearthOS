export function parseGpsPoint(body: unknown, now = Date.now()) {
  if (!body || typeof body !== 'object') return null;
  const { lat, lng, accuracy, speed, heading, timestamp } = body as Record<string, unknown>;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90 ||
      typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
  if (accuracy != null && (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 200)) return null;
  const at = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(at) || now - at > 120_000 || at - now > 30_000) return null;
  return { lat, lng, accuracy: typeof accuracy === 'number' ? accuracy : undefined,
    speed: typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed : null,
    heading: typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 && heading < 360 ? heading : null,
    timestamp: new Date(at).toISOString() };
}
