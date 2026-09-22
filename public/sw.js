/**
 * Service worker for Work Optional — the part that makes "add to home
 * screen" behave like an app: the whole shell works offline.
 *
 * Strategy (deliberately conservative — a financial app, no offline writes):
 *   - Cross-origin (the sync service)  → never intercepted; always network.
 *   - /_next/static/*                   → cache-first. These URLs are
 *     content-hashed, so a cached copy is never stale; new builds get new
 *     URLs.
 *   - Navigations (the HTML)            → network-first, and every
 *     successful response refreshes the cached shell, so the offline copy is
 *     always the last version you actually opened. Offline → the cached
 *     shell (whose hashed scripts are in the cache too), never the browser's
 *     "no internet" page.
 *   - Everything else                   → pass-through.
 *
 * Nothing the user typed is ever cached here: the ledger and plan live in
 * localStorage, which the app reads itself. Bump CACHE_VERSION to drop old
 * caches on activate.
 */

const CACHE_VERSION = 'workoptional-v2';
const SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.add(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(SHELL, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(SHELL).then(
            (cached) =>
              cached ??
              new Response('Offline. Reconnect and try again.', {
                status: 503,
                headers: { 'content-type': 'text/plain' },
              }),
          ),
        ),
    );
  }
});
