const CACHE_NAME = "hearth-tech-public-v2";
const APP_SHELL = [
  "/tech/manifest.webmanifest",
  "/tech/icon-192.png",
  "/tech/icon-512.png",
  "/tech/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("hearth-tech-") && key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isTechDocument = request.mode === "navigate" && url.pathname.startsWith("/tech");
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    APP_SHELL.includes(url.pathname);

  if (isTechDocument) {
    event.respondWith(
      fetch(request)
        .catch(() => new Response("<!doctype html><html lang=\"en\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>HearthOS offline</title><body><h1>You are offline</h1><p>Reconnect to load your jobs securely. Unsent changes are not automatically delivered.</p></body></html>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })),
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (!response.ok || response.redirected) return response;
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
  }
});
