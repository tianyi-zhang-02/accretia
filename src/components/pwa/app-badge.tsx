'use client';

import { useEffect } from 'react';

import { monthWaiting, type MonthEntry } from '@/lib/ledger/ledger';

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * A dot on the installed app's icon while last month is still unlogged.
 * The Badging API is local (no permission prompt on desktop, no network,
 * nothing stored); where it doesn't exist — or before the app is
 * installed — this does nothing. It only updates while the app is open:
 * there is deliberately no background job. Before the saved ledger loads,
 * `entries` is empty, which only ever clears the badge.
 */
export function useAppBadge(entries: MonthEntry[]) {
  useEffect(() => {
    const nav = navigator as BadgeNavigator;
    if (!nav.setAppBadge || !nav.clearAppBadge) return;
    const update = () => {
      const now = new Date();
      const waiting = monthWaiting(entries, { year: now.getFullYear(), month: now.getMonth() + 1 });
      (waiting ? nav.setAppBadge!(1) : nav.clearAppBadge!()).catch(() => {});
    };
    update();
    // Pick up a month rolling over while the app sits open.
    const onVisible = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [entries]);
}
