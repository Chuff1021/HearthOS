import assert from "node:assert/strict";
import test from "node:test";
import { escapeMapHtml, getLocationMarkers, initializeMap, locationLabel, markerHtml, STALE_LOCATION_MS, validatedLocation } from "../../src/components/dashboard/operations-map-data";

const now = Date.parse("2026-09-09T18:00:00Z");
const location = { lat: 37.2, lng: -93.3, timestamp: new Date(now - 60_000).toISOString(), accuracy: 12 };

test("only finite, in-range coordinates with a usable non-future report time are mapped", () => {
  assert.ok(validatedLocation(location, now));
  for (const invalid of [
    null, {}, { ...location, lat: NaN }, { ...location, lng: Infinity },
    { ...location, lat: 91 }, { ...location, lng: -181 }, { ...location, lat: "37.2" },
    { ...location, lat: 0, lng: 0 }, { ...location, timestamp: "invalid" },
    { ...location, timestamp: "2026-09-09" }, { ...location, timestamp: new Date(now + 1).toISOString() },
    { ...location, accuracy: -1 }, { ...location, accuracy: NaN },
  ]) assert.equal(validatedLocation(invalid, now), null);
  assert.ok(validatedLocation({ ...location, lat: 0 }, now));
  assert.ok(validatedLocation({ ...location, accuracy: undefined }, now));
});

test("no fallback staff, no cap of eight locations, no inference from job addresses", () => {
  assert.deepEqual(getLocationMarkers([{ id: "absent", name: "Unlocated" }], now), []);
  const techs = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Tech ${i}`, location }));
  assert.equal(getLocationMarkers([...techs, { id: "missing", name: "No report", location: null }], now).length, 12);
});

test("freshness ages actual timestamps and retains stale reports as explicitly historical", () => {
  const tech = { id: "t", name: "Test Technician", location };
  const [recent] = getLocationMarkers([tech], now);
  assert.equal(recent.stale, false);
  assert.match(locationLabel(recent), /Reported within 30 min/);
  const [older] = getLocationMarkers([tech], now + STALE_LOCATION_MS);
  assert.equal(older.stale, true);
  assert.match(markerHtml(older), /Older report/);
  assert.match(locationLabel(older), /Older than 30 min/);
  assert.match(locationLabel(older), /Accuracy \+\/-12 m/);
  assert.doesNotMatch(locationLabel(recent), /live|synced|On Job/i);
});

test("marker labels escape HTML and reject CSS injection", () => {
  const [marker] = getLocationMarkers([{ id: "t", name: '<img src=x onerror="alert(1)">', initials: "<&", color: "red;background:url(https://example.invalid)", location }], now);
  const html = markerHtml(marker);
  assert.match(html, /&lt;&amp;/);
  assert.doesNotMatch(html, /url\(|<img|onerror/);
  assert.match(escapeMapHtml(locationLabel(marker)), /&lt;img/);
});

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("delayed map initialization publishes readiness even if data was already present", async () => {
  let resolve!: (module: string) => void;
  const load = new Promise<string>((done) => { resolve = done; });
  const events: string[] = [];
  const cleanup = initializeMap(() => load, (module) => {
    events.push(module);
    return { remove: () => { events.push("removed"); } };
  }, () => { events.push("ready: render current markers"); }, () => { events.push("error"); });
  assert.deepEqual(events, []);
  resolve("created");
  await flush();
  assert.deepEqual(events, ["created", "ready: render current markers"]);
  cleanup();
  cleanup();
  assert.equal(events.filter((value) => value === "removed").length, 1);
});

test("unmount/Strict Mode cancellation never creates or publishes an abandoned map", async () => {
  let resolve!: (module: string) => void;
  const load = new Promise<string>((done) => { resolve = done; });
  let creates = 0;
  let publishes = 0;
  const create = () => { creates++; return { remove: () => {} }; };
  const ready = () => { publishes++; };
  const abandoned = initializeMap(() => load, create, ready, assert.fail);
  abandoned();
  const active = initializeMap(() => load, create, ready, assert.fail);
  resolve("module");
  await flush();
  assert.equal(creates, 1);
  assert.equal(publishes, 1);
  active();
});

test("import errors are handled, but ignored after unmount", async () => {
  let errors = 0;
  const failed = () => { errors++; };
  const create = () => ({ remove: () => {} });
  const ready = () => assert.fail("failed import must not publish");
  const cleanup = initializeMap(() => Promise.reject(new Error("offline")), create, ready, failed);
  await flush();
  assert.equal(errors, 1);
  cleanup();
  const cancelled = initializeMap(() => Promise.reject(new Error("offline")), create, ready, failed);
  cancelled();
  await flush();
  assert.equal(errors, 1);
});
