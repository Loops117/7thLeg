// /sw.js — PWA service worker for 7th Leg Hub
const VERSION = "pwa-v1.1";
const CACHE_STATIC = `static-${VERSION}`;
const APP_SHELL = [
  "/communityhub/hub.html",
  "/assets/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/js/include.js",
  "/assets/js/header-auth.js",
  "/assets/js/config.js",
  "/assets/js/swr-cache.js",
  "/offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    try { await cache.addAll(APP_SHELL); } catch {}
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => { if (!k.includes(VERSION)) return caches.delete(k); }));
    if ("navigationPreload" in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    self.clients.claim();
  })());
});

// Stale-while-revalidate for same-origin GET requests; network-first for navigations
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        const net = await fetch(req);
        return net;
      } catch {
        const cache = await caches.open(CACHE_STATIC);
        return (await cache.match("/communityhub/hub.html")) ||
               (await cache.match("/offline.html")) ||
               Response.redirect("/offline.html", 302);
      }
    })());
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIC);
      const cached = await cache.match(req);
      const fetchAndCache = fetch(req).then(res => {
        try {
          if (res && res.status === 200) cache.put(req, res.clone());
        } catch {}
        return res.clone();
      }).catch(() => cached);
      return cached || fetchAndCache;
    })());
  }
});
