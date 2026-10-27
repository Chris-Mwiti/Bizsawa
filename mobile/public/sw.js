/*
 * BizSawa PWA service worker.
 *
 * Rules that matter:
 *  1. NEVER cache API traffic. Stale business data is worse than no data —
 *     a queued sale that silently vanished is a lost sale. Every request
 *     that isn't same-origin static content goes straight to the network.
 *  2. Offline shell. Navigations fall back to the cached index.html so the
 *     app opens with no connection; the app then reads its data from
 *     IndexedDB (LokiJS) and syncs when the network returns.
 *  3. Static assets are hashed at build time, so they're cached lazily on
 *     first use (stale-while-revalidate) rather than precached by name.
 */

const VERSION = 'v1';
const SHELL_CACHE = `bizsawa-shell-${VERSION}`;
const ASSET_CACHE = `bizsawa-assets-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE]);

/** Paths that are part of the app shell and safe to precache. */
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/**
 * Requests that must never be served from cache. The API base may live on a
 * different origin (staging/prod), so we check the path of every request and
 * treat anything that looks like API traffic as network-only.
 */
function isApiRequest(url) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/auth/')) return true;
  if (url.pathname.startsWith('/businesses')) return true;
  if (url.pathname.startsWith('/sync')) return true;
  if (url.pathname.startsWith('/inventory')) return true;
  if (url.pathname.startsWith('/sales')) return true;
  if (url.pathname.startsWith('/expenses')) return true;
  if (url.pathname.startsWith('/products')) return true;
  if (url.pathname.startsWith('/customers')) return true;
  if (url.pathname.startsWith('/invoices')) return true;
  if (url.pathname.startsWith('/orders')) return true;
  if (url.pathname.startsWith('/users')) return true;
  if (url.pathname.startsWith('/tenants')) return true;
  if (url.pathname.startsWith('/invites')) return true;
  if (url.pathname.startsWith('/reports')) return true;
  if (url.pathname.startsWith('/mpesa')) return true;
  return false;
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_expo/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/node_modules/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // Individually, so one 404 doesn't fail the whole install.
        Promise.all(
          CORE_ASSETS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !KEEP.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  // "skipWaiting" message from the app's update prompt.
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin (e.g. the API host) — never touch the cache.
  if (url.origin !== self.location.origin) return;

  // API traffic — network only, always.
  if (isApiRequest(url)) return;

  // Navigations: network first, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match('/index.html')
          .then((cached) => cached || caches.match('/'))
          .then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url) || /\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);

        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || network;
      }),
    );
  }
});
