/**
 * "A new version is ready" — the update flow for the installed app.
 *
 * An installed app (or a tab left open for days) keeps running the JS it
 * loaded. The only way it learns about a deploy without new network code is
 * the browser's own service-worker update check: `registration.update()`
 * re-fetches `/sw.js` (same origin) and, if its bytes changed, installs the
 * new worker next to the old one. `public/sw.js` carries a build stamp
 * (scripts/build-sw.mjs), so every deploy is a byte change.
 *
 * The new worker then WAITS (sw.js no longer skips waiting on install) until
 * the person presses Refresh: we post SKIP_WAITING to it, it activates and
 * claims the page, and the page reloads once on `controllerchange`.
 *
 * Which workers count as "new"? Whatever this page started with is its own
 * version: its HTML came from the network (navigations are network-first),
 * so a worker found by the first check is the same deploy, or the offline
 * shell that worker installed — never something newer than the code running.
 * Only a worker that turns up LATER means the page is now behind.
 *
 * Reload loops are impossible by construction: the page reloads only after a
 * click on Refresh in this page, at most once, and a freshly loaded page
 * counts every worker it finds at startup as its own.
 *
 * Kept free of React and of the real ServiceWorker types so it can be tested
 * with plain EventTargets.
 */

/** The bits of a ServiceWorker the flow uses. */
export type WorkerLike = EventTarget & {
  readonly state: string;
  postMessage(message: unknown): void;
};

/** The bits of a ServiceWorkerRegistration the flow uses. */
export type RegistrationLike = EventTarget & {
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
  readonly active: WorkerLike | null;
  update(): Promise<unknown>;
};

/** The bits of navigator.serviceWorker the flow uses. */
export type ContainerLike = EventTarget & { readonly controller: WorkerLike | null };

/** The message public/sw.js answers with `self.skipWaiting()`. */
export const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

/** Don't re-check more often than this (tab flipping shouldn't hammer /sw.js). */
export const CHECK_INTERVAL_MS = 60_000;

/** If the new worker never takes over (it failed, or was replaced), reload anyway. */
export const TAKEOVER_TIMEOUT_MS = 4_000;

export type UpdateWatcher = {
  /** Ask the server whether /sw.js changed. Throttled; errors (offline) ignored. */
  check(): void;
  /** The person pressed Refresh: hand over to the waiting worker, then reload once. */
  apply(): void;
  /** Remove every listener. */
  stop(): void;
};

export type WatchOptions = {
  /** Called once, when this page is running an older version than the server's. */
  onReady: () => void;
  reload: () => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => void;
};

export async function watchForUpdates(
  reg: RegistrationLike,
  container: ContainerLike,
  { onReady, reload, now = Date.now, setTimer = (fn, ms) => void setTimeout(fn, ms) }: WatchOptions,
): Promise<UpdateWatcher> {
  // The first check. Anything it finds is this page's own version (see above).
  let lastCheck = now();
  await reg.update().catch(() => undefined);
  const own = new Set<WorkerLike>();
  for (const w of [container.controller, reg.active, reg.waiting, reg.installing]) {
    if (w) own.add(w);
  }

  let controlled = container.controller !== null;
  let announced = false;
  let requested = false;
  let reloading = false;
  const cleanups: Array<() => void> = [];

  const announce = () => {
    if (announced || reloading) return;
    announced = true;
    onReady();
  };
  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    reload();
  };

  // A worker found after startup: once it's installed (now waiting) and this
  // page is controlled by the old one, the page is behind. With no controller
  // this is a first install — nothing to announce.
  const follow = (w: WorkerLike) => {
    if (own.has(w)) return;
    const onState = () => {
      if (w.state === 'installed' && container.controller) announce();
    };
    w.addEventListener('statechange', onState);
    cleanups.push(() => w.removeEventListener('statechange', onState));
    onState();
  };

  const onUpdateFound = () => {
    if (reg.installing) follow(reg.installing);
  };

  const onControllerChange = () => {
    if (requested) return reloadOnce();
    // Another window pressed Refresh: the new worker now controls this page
    // too, but this page is still running the old code.
    const next = container.controller;
    if (controlled && next && !own.has(next)) announce();
    controlled = controlled || next !== null;
  };

  reg.addEventListener('updatefound', onUpdateFound);
  container.addEventListener('controllerchange', onControllerChange);
  cleanups.push(
    () => reg.removeEventListener('updatefound', onUpdateFound),
    () => container.removeEventListener('controllerchange', onControllerChange),
  );

  return {
    check() {
      if (reloading || now() - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = now();
      void reg.update().catch(() => undefined);
    },
    apply() {
      if (reloading) return;
      requested = true;
      const waiting = reg.waiting;
      if (waiting && container.controller) {
        waiting.postMessage(SKIP_WAITING);
        setTimer(reloadOnce, TAKEOVER_TIMEOUT_MS);
      } else {
        reloadOnce();
      }
    },
    stop() {
      for (const off of cleanups.splice(0)) off();
    },
  };
}
