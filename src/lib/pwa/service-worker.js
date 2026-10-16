/**
 * Service worker for Work Optional — the part that makes "add to home
 * screen" behave like an app: the whole shell works offline.
 *
 * THIS IS THE SOURCE. `npm run build` (prebuild → scripts/build-sw.mjs)
 * copies it to public/sw.js with a build stamp on the first line, so every
 * deploy changes the worker's bytes — which is what lets an open or
 * installed app notice the deploy (see src/lib/pwa/update.ts). public/sw.js
 * is generated and not committed; edit this file.
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
 * Updates (v4): a new worker installs next to the running one — caching the
 * new shell AND the scripts it references, so the offline copy is never a
 * shell without its chunks — and then WAITS. The page shows "A new version
 * is ready"; pressing Refresh posts SKIP_WAITING, this worker takes over and
 * the page reloads once. Until then an open app keeps the worker it started
 * with. A first install has nothing to wait for and activates at once.
 *
 * Nothing the user typed is ever cached here: the ledger and plan live in
 * localStorage, which the app reads itself. Bump CACHE_VERSION to drop old
 * caches on activate.
 */

const CACHE_VERSION = 'workoptional-v4';
const SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch(SHELL, { cache: 'no-store' }).then((res) => {
      if (!res.ok) throw new Error(`shell ${res.status}`);
      return refreshShell(res);
    }),
  );
});

// The page asks for the hand-over only when the person pressed Refresh.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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

/**
 * Store the shell AND every static asset it references. Relying on the
 * browser's own requests to fill the cache leaves gaps (a chunk fetched
 * before the worker took control, or from memory cache) — and one missing
 * chunk is a blank screen offline.
 */
async function refreshShell(res) {
  const cache = await caches.open(CACHE_VERSION);
  const html = await res.clone().text();
  await cache.put(SHELL, res);
  const urls = [
    ...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1])),
  ];
  await Promise.all(
    urls.map(async (u) => {
      if (await cache.match(u)) return;
      const r = await fetch(u).catch(() => null);
      if (r && r.ok) await cache.put(u, r);
    }),
  );
}

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
          if (res.ok) event.waitUntil(refreshShell(res.clone()));
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
