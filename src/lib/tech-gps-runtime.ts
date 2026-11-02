import type { GpsStatus } from "@/components/tech/GpsStatusContext";

type Ports = {
  navigator: Pick<Navigator, "geolocation" | "permissions" | "onLine">;
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  fetch: typeof fetch;
  update: (patch: Partial<GpsStatus>) => void;
};

/** One runtime per authenticated user. Never reuse a stored position as a fresh ping. */
export function startGpsRuntime(p: Ports) {
  let disposed = false, eligible = false, denied = false;
  let watch: number | null = null, generation = 0, refreshing = false;
  let sessionVersion = 0, refreshQueued = false;
  let lastSession = 0, lastFix = 0, lastSent = 0, lastAttempt = 0;
  let permission: PermissionStatus | null = null;
  let sessionController: AbortController | null = null, uploadController: AbortController | null = null;
  let gettingFix = false;
  const geo = p.navigator.geolocation;
  const visible = () => p.document.visibilityState === "visible";
  const online = () => p.navigator.onLine !== false;
  const ready = () => !disposed && eligible && !denied && visible() && online();
  const update = (patch: Partial<GpsStatus>) => { if (!disposed) p.update(patch); };

  function stopWatch() {
    generation++;
    if (watch !== null && geo) geo.clearWatch(watch);
    watch = null;
    gettingFix = false;
    uploadController?.abort();
    update({ isTracking: false });
  }

  function onError(error: GeolocationPositionError) {
    if (error.code === 1) {
      denied = true;
      stopWatch();
      update({ gpsPermission: "denied", error: "Location is blocked. Allow location access for HearthOS in your browser and phone settings." });
    } else {
      update({ isTracking: false, error: error.code === 3 ? "GPS timed out. Retrying automatically." : "GPS signal unavailable. Retrying automatically." });
    }
  }

  async function onPosition(pos: GeolocationPosition, epoch: number) {
    if (!ready() || epoch !== generation) return;
    lastFix = Date.now();
    const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords;
    update({ accuracy, gpsPermission: "granted" });
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 200) {
      update({ isTracking: false, error: "GPS accuracy is too low. Waiting for a clearer signal." });
      return;
    }
    if (!Number.isFinite(pos.timestamp) || Date.now() - pos.timestamp > 90_000 || pos.timestamp > Date.now() + 30_000) return;
    if (uploadController || Date.now() - lastAttempt < 10_000 || Date.now() - lastSent < 15_000) return;
    const controller = new AbortController();
    uploadController = controller;
    lastAttempt = Date.now();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await p.fetch("/api/tech/locations", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ lat, lng, accuracy, speed, heading, timestamp: new Date(pos.timestamp).toISOString() }),
      });
      if (disposed || epoch !== generation) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          eligible = false;
          stopWatch();
          throw new Error("Location sharing needs an active signed-in shift. Check your sign-in and clock-in status.");
        }
        throw new Error("Location could not reach dispatch. Retrying automatically.");
      }
      const result = await response.json();
      if (!result.point?.timestamp || !Number.isFinite(Date.parse(result.point.timestamp))) throw new Error("Location was not confirmed by dispatch. Retrying automatically.");
      if (!ready() || epoch !== generation) return;
      lastSent = Date.now();
      update({ isTracking: true, lastPingAt: result.point.timestamp, error: null });
    } catch (error) {
      if (!disposed && epoch === generation) update({ isTracking: false, error: error instanceof Error && error.name !== "AbortError" ? error.message : "Location upload timed out. Retrying automatically." });
      else if (!disposed && !eligible) update({ error: "Location sharing needs an active signed-in shift. Check your sign-in and clock-in status." });
    } finally {
      clearTimeout(timeout);
      if (uploadController === controller) uploadController = null;
    }
  }

  function requestFix() {
    if (!ready() || !geo || gettingFix) return;
    gettingFix = true;
    const epoch = generation;
    geo.getCurrentPosition(pos => {
      if (epoch !== generation || disposed) return;
      gettingFix = false;
      void onPosition(pos, epoch);
    }, err => {
      if (epoch !== generation || disposed) return;
      gettingFix = false;
      onError(err);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
  }

  function startWatch() {
    if (!ready()) return;
    if (!geo) { update({ isTracking: false, error: "This browser does not support location sharing." }); return; }
    if (watch === null) {
      const epoch = generation;
      watch = geo.watchPosition(pos => { void onPosition(pos, epoch); }, err => {
        if (!disposed && epoch === generation) onError(err);
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
    }
    requestFix();
  }

  async function refreshSession(restart = false) {
    if (disposed || !visible() || !online()) return;
    if (refreshing) { if (restart) refreshQueued = true; return; }
    refreshing = true;
    const version = sessionVersion;
    const controller = new AbortController();
    sessionController = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await p.fetch("/api/tech/locations?session=true", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to resume GPS sharing." : "Unable to verify your shift. Retrying automatically.");
      const data = await response.json();
      if (disposed || version !== sessionVersion) return;
      lastSession = Date.now();
      eligible = data.trackingAllowed === true;
      if (!eligible) { stopWatch(); update({ error: null }); return; }
      if (restart) stopWatch();
      startWatch();
    } catch (error) {
      if (disposed || version !== sessionVersion) return;
      eligible = false;
      stopWatch();
      update({ error: error instanceof Error && error.name !== "AbortError" ? error.message : "Shift check timed out. Retrying automatically." });
    } finally {
      clearTimeout(timeout);
      refreshing = false;
      if (sessionController === controller) sessionController = null;
      if (refreshQueued && !disposed) { refreshQueued = false; void refreshSession(true); }
    }
  }

  const resume = () => { void refreshSession(true); };
  const visibility = () => {
    if (visible()) resume();
    else { stopWatch(); update({ error: "Location sharing pauses while HearthOS is in the background." }); }
  };
  const offline = () => { stopWatch(); update({ error: "Offline. Location sharing will retry when connected." }); };
  const retry = () => { denied = false; lastAttempt = 0; resume(); };
  const clockChanged = () => { sessionVersion++; sessionController?.abort(); eligible = false; stopWatch(); resume(); };
  const permissionChanged = () => {
    denied = permission?.state === "denied";
    update({ gpsPermission: permission?.state ?? "unknown" });
    if (denied) onError({ code: 1 } as GeolocationPositionError);
    else { update({ error: null }); resume(); }
  };
  p.document.addEventListener("visibilitychange", visibility);
  p.window.addEventListener("focus", resume);
  p.window.addEventListener("online", resume);
  p.window.addEventListener("offline", offline);
  p.window.addEventListener("hearth-tech-clock-changed", clockChanged);
  p.window.addEventListener("hearth-gps-retry", retry);
  p.navigator.permissions?.query({ name: "geolocation" }).then(status => {
    if (disposed) return;
    permission = status;
    permission.addEventListener("change", permissionChanged);
    permissionChanged();
  }).catch(() => {});
  const interval = setInterval(() => {
    if (!visible() || !online() || disposed) return;
    if (Date.now() - lastSent > 90_000) update({ isTracking: false });
    if (Date.now() - lastSession >= 60_000) void refreshSession();
    else if (ready()) {
      if (Date.now() - lastFix > 90_000) { stopWatch(); startWatch(); }
      else if (Date.now() - lastSent >= 45_000) requestFix();
    }
  }, 30_000);
  void refreshSession();
  return () => {
    stopWatch();
    disposed = true;
    sessionController?.abort();
    clearInterval(interval);
    permission?.removeEventListener("change", permissionChanged);
    p.document.removeEventListener("visibilitychange", visibility);
    p.window.removeEventListener("focus", resume);
    p.window.removeEventListener("online", resume);
    p.window.removeEventListener("offline", offline);
    p.window.removeEventListener("hearth-tech-clock-changed", clockChanged);
    p.window.removeEventListener("hearth-gps-retry", retry);
  };
}
