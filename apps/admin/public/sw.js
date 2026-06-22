// Minimal service worker so the admin app is installable as a PWA.
// We intentionally do NOT cache app shell here — Vite's hashed assets +
// Vercel's edge cache already give fast loads, and a stale cached shell
// during deploys causes more pain than it saves. This SW exists primarily
// to satisfy the PWA install criteria (HTTPS + manifest + SW).
//
// If you want full offline support later, add a workbox-style cache strategy
// or swap for vite-plugin-pwa with autoUpdate.

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Pass through every request to the network. No caching.
self.addEventListener('fetch', (e) => {
  // Don't try to handle non-GET — let the browser do its thing.
  if (e.request.method !== 'GET') return;
  // Default browser handling.
});
