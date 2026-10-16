import { describe, expect, it, vi } from 'vitest';

import {
  CHECK_INTERVAL_MS,
  SKIP_WAITING,
  TAKEOVER_TIMEOUT_MS,
  watchForUpdates,
  type ContainerLike,
  type RegistrationLike,
  type WorkerLike,
} from './update';

// Plain EventTargets standing in for the Service Worker API.

class FakeWorker extends EventTarget implements WorkerLike {
  state = 'installing';
  messages: unknown[] = [];
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  setState(state: string) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget implements RegistrationLike {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  updates = 0;
  /** What the next update() finds on the server, if anything. */
  next: FakeWorker | null = null;
  fail = false;
  async update() {
    this.updates++;
    if (this.fail) throw new Error('offline');
    if (this.next) this.found(this.next);
    this.next = null;
  }
  /** The browser found a new /sw.js and started installing it. */
  found(w: FakeWorker) {
    this.installing = w;
    this.dispatchEvent(new Event('updatefound'));
  }
  /** It finished installing and is waiting for the old one to go. */
  installed(w: FakeWorker) {
    this.installing = null;
    this.waiting = w;
    w.setState('installed');
  }
}

class FakeContainer extends EventTarget implements ContainerLike {
  controller: FakeWorker | null = null;
  /** `w` became active and claimed the page. */
  takeOver(reg: FakeRegistration, w: FakeWorker) {
    reg.waiting = null;
    reg.active = w;
    w.setState('activated');
    this.controller = w;
    this.dispatchEvent(new Event('controllerchange'));
  }
}

function setup({ controlled = true } = {}) {
  const reg = new FakeRegistration();
  const container = new FakeContainer();
  if (controlled) {
    const old = new FakeWorker();
    old.state = 'activated';
    reg.active = old;
    container.controller = old;
  }
  let clock = 1_000_000;
  const timers: Array<() => void> = [];
  const onReady = vi.fn();
  const reload = vi.fn();
  const start = () =>
    watchForUpdates(reg, container, {
      onReady,
      reload,
      now: () => clock,
      setTimer: (fn) => void timers.push(fn),
    });
  const tick = (ms: number) => (clock += ms);
  return { reg, container, onReady, reload, start, tick, timers };
}

describe('watchForUpdates', () => {
  it('checks /sw.js once at startup', async () => {
    const { reg, start } = setup();
    await start();
    expect(reg.updates).toBe(1);
  });

  it('announces a worker that turns up after startup, once it is installed', async () => {
    const { reg, start, tick, onReady } = setup();
    const w = await start();
    tick(CHECK_INTERVAL_MS);
    const fresh = new FakeWorker();
    reg.next = fresh;
    w.check();
    await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled(); // still installing
    reg.installed(fresh);
    expect(onReady).toHaveBeenCalledTimes(1);
    // A second statechange doesn't announce twice.
    fresh.setState('installed');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('treats a worker found at startup as this page’s own version', async () => {
    const { reg, start, onReady } = setup();
    // This load got the new HTML; the new /sw.js turns up in the same check.
    const fresh = new FakeWorker();
    reg.next = fresh;
    await start();
    reg.installed(fresh);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('treats a worker already waiting at startup as this page’s own version', async () => {
    const { reg, start, onReady } = setup();
    const waiting = new FakeWorker();
    waiting.state = 'installed';
    reg.waiting = waiting;
    await start();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('says nothing on a first install (no controller yet)', async () => {
    const { reg, container, start, tick, onReady } = setup({ controlled: false });
    const w = await start();
    tick(CHECK_INTERVAL_MS);
    const first = new FakeWorker();
    reg.next = first;
    w.check();
    await Promise.resolve();
    reg.installed(first);
    container.takeOver(reg, first); // clients.claim()
    expect(onReady).not.toHaveBeenCalled();
  });

  it('throttles checks and survives being offline', async () => {
    const { reg, start, tick } = setup();
    reg.fail = true;
    const w = await start();
    w.check(); // too soon
    expect(reg.updates).toBe(1);
    tick(CHECK_INTERVAL_MS);
    w.check();
    await Promise.resolve();
    expect(reg.updates).toBe(2);
  });

  it('Refresh asks the waiting worker to take over, then reloads exactly once', async () => {
    const { reg, container, start, tick, reload, timers } = setup();
    const w = await start();
    tick(CHECK_INTERVAL_MS);
    const fresh = new FakeWorker();
    reg.next = fresh;
    w.check();
    await Promise.resolve();
    reg.installed(fresh);

    w.apply();
    expect(fresh.messages).toEqual([SKIP_WAITING]);
    expect(reload).not.toHaveBeenCalled();
    container.takeOver(reg, fresh);
    expect(reload).toHaveBeenCalledTimes(1);
    // A second controllerchange, the fallback timer, or another click: no more reloads.
    container.dispatchEvent(new Event('controllerchange'));
    for (const fn of timers) fn();
    w.apply();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads after a timeout if the new worker never takes over', async () => {
    const { reg, start, tick, reload, timers } = setup();
    const w = await start();
    tick(CHECK_INTERVAL_MS);
    const fresh = new FakeWorker();
    reg.next = fresh;
    w.check();
    await Promise.resolve();
    reg.installed(fresh);
    w.apply();
    expect(timers).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
    timers[0]!();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(TAKEOVER_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('Refresh with no waiting worker is a plain reload', async () => {
    const { start, reload, timers } = setup();
    const w = await start();
    w.apply();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(0);
  });

  it('never reloads on its own — not when another window hands over', async () => {
    const { reg, container, start, tick, reload } = setup();
    const w = await start();
    tick(CHECK_INTERVAL_MS);
    const fresh = new FakeWorker();
    reg.next = fresh;
    w.check();
    await Promise.resolve();
    reg.installed(fresh);
    // Refresh was pressed in another window.
    container.takeOver(reg, fresh);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a hand-over from another window tells a page that missed the update', async () => {
    const { reg, container, start, onReady, reload } = setup();
    await start();
    // The new worker was found and activated elsewhere while this tab slept.
    const fresh = new FakeWorker();
    container.takeOver(reg, fresh);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a hand-over to this page’s own version says nothing', async () => {
    const { reg, container, start, onReady } = setup();
    const fresh = new FakeWorker();
    reg.next = fresh;
    await start(); // found at startup: this page's own version
    reg.installed(fresh);
    container.takeOver(reg, fresh); // another window pressed Refresh
    expect(onReady).not.toHaveBeenCalled();
  });

  it('stop() removes the listeners', async () => {
    const { reg, start, tick, onReady } = setup();
    const w = await start();
    w.stop();
    tick(CHECK_INTERVAL_MS);
    const fresh = new FakeWorker();
    reg.found(fresh);
    reg.installed(fresh);
    expect(onReady).not.toHaveBeenCalled();
  });
});
