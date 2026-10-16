'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { watchForUpdates, type UpdateWatcher } from '@/lib/pwa/update';

/**
 * Registers the service worker and watches for a newer version of the app.
 * Wraps the page in the root layout; registers in production builds only
 * (see below).
 *
 * Update flow (logic in lib/pwa/update.ts): check /sw.js on registration and
 * whenever the page becomes visible again; when a newer worker is installed
 * while an older one runs this page, `ready` turns true and the page shows
 * "A new version is ready" (`UpdateBanner`). `refresh()` hands over to the
 * new worker and reloads once — it's also what every "data from a newer
 * version" message offers. The only request this adds is the browser's own
 * same-origin fetch of /sw.js.
 *
 * Failures are swallowed: registration only matters for installability, the
 * offline shell and the update notice, not for any actual functionality.
 */

export type AppUpdate = {
  /** A newer version is installed and waiting for a refresh. */
  ready: boolean;
  /** Reload into the newest version (lets a waiting worker take over first). */
  refresh: () => void;
};

const UpdateContext = createContext<AppUpdate>({
  ready: false,
  refresh: () => window.location.reload(),
});

export function useAppUpdate(): AppUpdate {
  return useContext(UpdateContext);
}

export default function ServiceWorkerRegister({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const watcher = useRef<UpdateWatcher | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Production only. The worker caches /_next/static/* cache-first, which
    // is safe when file names are content hashes (production) and stale in
    // `next dev`, where a CSS file keeps its name across edits. In dev, also
    // clear out any worker and cache left by an earlier production run — and
    // there is never an update notice.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())));
      void caches?.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      return;
    }

    let cancelled = false;
    const onVisible = () => {
      if (document.visibilityState === 'visible') watcher.current?.check();
    };
    const start = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;
        const w = await watchForUpdates(reg, navigator.serviceWorker, {
          onReady: () => setReady(true),
          reload: () => window.location.reload(),
        });
        if (cancelled) return w.stop();
        watcher.current = w;
        document.addEventListener('visibilitychange', onVisible);
      } catch (err) {
        console.warn('[sw] registration failed', err);
      }
    };
    // Wait until the page is loaded so we don't fight first-paint.
    const onLoad = () => void start();
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', onLoad);
      document.removeEventListener('visibilitychange', onVisible);
      watcher.current?.stop();
      watcher.current = null;
    };
  }, []);

  const refresh = useCallback(() => {
    if (watcher.current) watcher.current.apply();
    else window.location.reload();
  }, []);
  const value = useMemo(() => ({ ready, refresh }), [ready, refresh]);

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}
