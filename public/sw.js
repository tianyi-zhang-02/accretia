/**
 * Service worker for the tracker PWA.
 *
 * Strategy (deliberately conservative — financial app, no offline writes):
 *   - /api/* and /auth/* → never intercept. Always go to the network.
 *   - Navigation requests (HTML)   → network-first, fall back to the
 *     cached shell ('/') if the device is offline. So opening the app
 *     while offline shows the dashboard chrome rather than the browser's
 *     "no internet" page.
 *   - Everything else → pass-through. The browser's built-in cache handles
 *     /_next/static/* with content-hashed URLs better than we would.
 *
 * Bump CACHE_VERSION whenever the install precache list changes — the
 * activate handler deletes any cache whose key doesn't match.
 */

const CACHE_VERSION = 'tracker-v1';
const SHELL_URLS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)),
  );
  // Activate the new SW immediately rather than waiting for tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ),
    ),
  );
  // Take control of currently-open clients without requiring a reload.
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET. Anything else (POST, PATCH, DELETE) goes straight to
  // the network — we never replay mutations from cache.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cross-origin requests (fonts, Alpha Vantage, etc.) pass through.
  if (url.origin !== self.location.origin) return;

  // Never cache API or auth — the server-side rate limiter and the
  // freshness guarantees there are too important to second-guess.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // HTML navigations: network-first with the shell as fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then(
          (cached) =>
            cached ??
            new Response('Offline. Reconnect and try again.', {
              status: 503,
              headers: { 'content-type': 'text/plain' },
            }),
        ),
      ),
    );
    return;
  }

  // Everything else — let the browser handle it.
});
