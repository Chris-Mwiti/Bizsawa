/*
 * Development-only service worker.
 *
 * The production worker (sw.js) caches the shell for offline use, which would
 * fight Metro's HMR and serve stale bundles. This one only exists so Chrome
 * sees an installable PWA in development: a fetch listener is required for
 * installability, but we never call respondWith, so every request still goes
 * straight to the dev server.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentionally no respondWith: network only.
});
