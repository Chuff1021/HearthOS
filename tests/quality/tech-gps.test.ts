import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { readFileSync } from 'node:fs';
import { startGpsRuntime } from '../../src/lib/tech-gps-runtime';
import { parseGpsPoint } from '../../src/lib/tech-gps-validation';
import type { GpsStatus } from '../../src/components/tech/GpsStatusContext';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 1793365200000 });
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const window = new EventTarget();
  const permission = Object.assign(new EventTarget(), { state: 'granted' });
  const callbacks: { success: PositionCallback; error?: PositionErrorCallback | null }[] = [];
  const fixes: PositionCallback[] = [];
  const cleared: number[] = [];
  const posts: Record<string, unknown>[] = [];
  let allowed = true, status = 201;
  let pendingPost: (() => Promise<Response>) | undefined;
  let pendingSession: (() => Promise<Response>) | undefined;
  const state: Partial<GpsStatus> = {};
  const navigator = { onLine: true, permissions: { query: async () => permission }, geolocation: {
    watchPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => callbacks.push({ success, error }),
    clearWatch: (id: number) => { cleared.push(id); },
    getCurrentPosition: (success: PositionCallback) => { fixes.push(success); },
  } };
  const stop = startGpsRuntime({ document, window, navigator, update: patch => Object.assign(state, patch),
    fetch: async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return pendingSession ? pendingSession() : Response.json({ trackingAllowed: allowed });
      const point = JSON.parse(String(init.body));
      posts.push(point);
      if (pendingPost) return pendingPost();
      return Response.json({ point }, { status });
    },
  } as unknown as Parameters<typeof startGpsRuntime>[0]);
  t.after(stop);
  const position = (overrides: Record<string, unknown> = {}) => ({
    coords: { latitude: 37, longitude: -93, accuracy: 10, speed: null, heading: null }, timestamp: Date.now(), ...overrides,
  }) as GeolocationPosition;
  return { state, callbacks, fixes, cleared, posts, position, document, window, navigator, permission, stop,
    setAllowed: (value: boolean) => { allowed = value; }, setStatus: (value: number) => { status = value; },
    deferPost: (fn: () => Promise<Response>) => { pendingPost = fn; },
    deferSession: (fn: () => Promise<Response>) => { pendingSession = fn; },
  };
}

test('GPS only reports connected after a confirmed server save; sends no employee identity', async t => {
  const h = harness(t); await flush();
  assert.notEqual(h.state.isTracking, true);
  h.callbacks.at(-1)!.success(h.position()); await flush();
  assert.equal(h.state.isTracking, true);
  assert.equal(h.state.lastPingAt, new Date(Date.now()).toISOString());
  assert.deepEqual(Object.keys(h.posts[0]).sort(), ['accuracy', 'heading', 'lat', 'lng', 'speed', 'timestamp']);
  h.callbacks.at(-1)!.success(h.position()); await flush();
  assert.equal(h.posts.length, 1, 'duplicate callbacks are throttled');
});

test('server failure is visible and a later fresh fix retries successfully', async t => {
  const h = harness(t); await flush(); h.setStatus(503);
  h.callbacks.at(-1)!.success(h.position()); await flush();
  assert.equal(h.state.isTracking, false); assert.match(h.state.error!, /could not reach dispatch/);
  t.mock.timers.tick(15_000); h.setStatus(201);
  h.callbacks.at(-1)!.success(h.position()); await flush();
  assert.equal(h.state.isTracking, true); assert.equal(h.state.error, null);
});

test('stationary foreground devices request fresh fixes without replaying cached coordinates', async t => {
  const h = harness(t); await flush();
  h.fixes.at(-1)!(h.position()); await flush();
  const before = h.fixes.length;
  t.mock.timers.tick(60_000); await flush();
  assert.ok(h.fixes.length > before); assert.equal(h.posts.length, 1);
  h.fixes.at(-1)!(h.position()); await flush();
  assert.equal(h.posts.length, 2);
  assert.notEqual(h.posts[0].timestamp, h.posts[1].timestamp);
});

test('background/resume replaces even a non-null stalled watch and ignores old callbacks', async t => {
  const h = harness(t); await flush(); const old = h.callbacks.at(-1)!;
  h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange'));
  old.success(h.position()); await flush(); assert.equal(h.posts.length, 0);
  const before = h.callbacks.length;
  h.document.visibilityState = 'visible'; h.document.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.ok(h.callbacks.length > before); assert.ok(h.cleared.length > 0);
  old.success(h.position()); await flush(); assert.equal(h.posts.length, 0);
  h.callbacks.at(-1)!.success(h.position()); await flush(); assert.equal(h.posts.length, 1);
});

test('denied permission stops sharing and changing permission recovers without a reload', async t => {
  const h = harness(t); await flush();
  h.permission.state = 'denied'; h.permission.dispatchEvent(new Event('change'));
  assert.equal(h.state.gpsPermission, 'denied'); assert.equal(h.state.isTracking, false);
  const before = h.callbacks.length;
  h.permission.state = 'granted'; h.permission.dispatchEvent(new Event('change')); await flush();
  assert.ok(h.callbacks.length > before);
  h.callbacks.at(-1)!.success(h.position()); await flush(); assert.equal(h.state.isTracking, true);
});

test('offline and clock-out stop uploads, online and clock-in recover', async t => {
  const h = harness(t); await flush();
  h.navigator.onLine = false; h.window.dispatchEvent(new Event('offline'));
  h.callbacks.at(-1)!.success(h.position()); await flush(); assert.equal(h.posts.length, 0);
  h.navigator.onLine = true; h.window.dispatchEvent(new Event('online')); await flush();
  h.setAllowed(false); h.window.dispatchEvent(new Event('hearth-tech-clock-changed')); await flush();
  h.callbacks.at(-1)!.success(h.position()); await flush(); assert.equal(h.posts.length, 0);
  h.setAllowed(true); h.window.dispatchEvent(new Event('hearth-tech-clock-changed')); await flush();
  h.callbacks.at(-1)!.success(h.position()); await flush(); assert.equal(h.posts.length, 1);
});

test('old session response cannot restart GPS after clock-out', async t => {
  const h = harness(t); await flush();
  let resolve!: (value: Response) => void;
  let calls = 0;
  h.deferSession(() => ++calls === 1 ? new Promise(r => { resolve = r; }) : Promise.resolve(Response.json({ trackingAllowed: false })));
  h.window.dispatchEvent(new Event('focus')); await flush();
  h.window.dispatchEvent(new Event('hearth-tech-clock-changed'));
  resolve(Response.json({ trackingAllowed: true })); await flush();
  h.callbacks.at(-1)!.success(h.position()); await flush();
  assert.equal(h.posts.length, 0); assert.equal(h.state.isTracking, false);
});

test('late upload success cannot mark a stopped runtime connected', async t => {
  const h = harness(t); await flush(); let resolve!: (value: Response) => void;
  h.deferPost(() => new Promise(r => { resolve = r; }));
  h.callbacks.at(-1)!.success(h.position()); await flush(); h.stop();
  resolve(Response.json({ point: { timestamp: new Date().toISOString() } })); await flush();
  assert.equal(h.state.isTracking, false);
});

test('inaccurate or stale fixes never produce a live ping', async t => {
  const h = harness(t); await flush();
  h.callbacks.at(-1)!.success(h.position({ coords: { latitude: 37, longitude: -93, accuracy: 900 } }));
  await flush(); assert.match(h.state.error!, /accuracy/);
  h.callbacks.at(-1)!.success(h.position({ timestamp: Date.now() - 100_000 }));
  await flush(); assert.equal(h.posts.length, 0);
});

test('coordinate parser rejects invalid, old, future, inaccurate and forged identity input', () => {
  const now = Date.now(), valid = { lat: 37, lng: -93, accuracy: 10, timestamp: new Date(now).toISOString() };
  assert.ok(parseGpsPoint(valid, now));
  for (const bad of [null, {}, { ...valid, lat: 91 }, { ...valid, lng: NaN }, { ...valid, accuracy: -1 },
    { ...valid, accuracy: 201 }, { ...valid, timestamp: new Date(now - 120001).toISOString() },
    { ...valid, timestamp: new Date(now + 30001).toISOString() }]) assert.equal(parseGpsPoint(bad, now), null);
  const clean = parseGpsPoint({ ...valid, techId: 'someone-else', orgId: 'other', speed: -1, heading: 360 }, now)!;
  assert.equal('techId' in clean, false); assert.equal('orgId' in clean, false);
  assert.equal(clean.speed, null); assert.equal(clean.heading, null);
});

test('dispatch never borrows another employee location and suppresses routing from stale GPS', () => {
  const source = readFileSync('src/app/dispatch/page.tsx', 'utf8');
  assert.match(source, /const selectedLocation = selectedTech\?\.location \|\| null/);
  assert.doesNotMatch(source, /selectedTech\?\.location \|\| liveTechs/);
  assert.match(source, /nextJob\?\.address \|\| selectedLocationStale\) return/);
  assert.match(source, /existing\.setTooltipContent\(tooltip\)/);
  assert.match(source, /if \(dispatchRequestRef\.current\) return/);
});
