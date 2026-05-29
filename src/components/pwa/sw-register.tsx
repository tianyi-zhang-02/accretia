'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker once on mount. Dropped into the root layout
 * so it loads on every page. Safe to ship in dev — the SW just returns
 * pass-through for everything except the shell fallback.
 *
 * Failures are swallowed: registration only matters for installability and
 * offline shell, not for any actual functionality.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
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
