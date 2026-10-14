'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker once on mount. Dropped into the root layout
 * so it loads on every page. Registers in production builds only (see below).
 *
 * Failures are swallowed: registration only matters for installability and
 * offline shell, not for any actual functionality.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Production only. The worker caches /_next/static/* cache-first, which
    // is safe when file names are content hashes (production) and stale in
    // `next dev`, where a CSS file keeps its name across edits. In dev, also
    // clear out any worker and cache left by an earlier production run.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())));
      void caches?.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      return;
    }
    // Wait until the page is loaded so we don't fight first-paint.
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[sw] registration failed', err);
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
