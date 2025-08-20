// /sw.js
// Basic service worker to cache static assets and hub modules (HTML/JS) with stale-while-revalidate.
// This reduces bandwidth for repeat navigations without touching your JS code.

const VERSION = "v1.0.0";
const STATIC_CACHE = `static-${VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/assets/css/style.css",
  "/assets/js/include.js",
  "/assets/js/header-auth.js",
  "/assets/js/config.js",
  "/assets/js/swr-cache.js",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS.filter(Boolean));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => { if (!k.includes(VERSION)) return caches.delete(k); }));
    self.clients.claim();
  })());
});

// Stale-while-revalidate for GET requests (HTML, JS, CSS, images, hub modules)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip Supabase auth endpoints and non-GET APIs with credentials
  if (url.pathname.includes("/auth/v1")) return;

  // Strategy: try cache first, then network, and update cache in background
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    const fetchAndCache = fetch(req).then(res => {
      // Only cache successful, basic/opaque responses
      try {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "opaque")) {
          cache.put(req, res.clone());
        }
      } catch {}
      return res.clone();
    }).catch(() => cached); // offline fallback

    return cached || fetchAndCache;
  })());
});
