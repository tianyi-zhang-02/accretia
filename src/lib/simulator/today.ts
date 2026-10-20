/**
 * The engine's "real" figures (`netWorthRealTodayDollars`, …) are in the
 * plan's START-year dollars. For a plan made this year that is today's
 * dollars; for one made years ago it isn't — a 2019 plan's "today's dollars"
 * are 2019's. Display code scales them by the inflation since then.
 * Presentation only: the engine and FIRE math are untouched.
 */

import type { SimulationResult, YearRow } from './engine';

/** 1 for a plan that starts this year or later. */
export function todayFactor(
  a: { horizonStartYear: number; inflationPct: number },
  thisYear = new Date().getFullYear(),
): number {
  const years = thisYear - a.horizonStartYear;
  return years > 0 ? Math.pow(1 + a.inflationPct / 100, years) : 1;
}

const scaleRow = (r: YearRow, f: number): YearRow => ({
  ...r,
  netWorthRealTodayDollars: r.netWorthRealTodayDollars * f,
  homeEquityRealTodayDollars: r.homeEquityRealTodayDollars * f,
});

/** The same result with its real figures in this year's dollars. */
export function inTodaysDollars(result: SimulationResult, f: number): SimulationResult {
  if (f === 1) return result;
  return {
    rows: result.rows.map((r) => scaleRow(r, f)),
    low: result.low.map((r) => scaleRow(r, f)),
    high: result.high.map((r) => scaleRow(r, f)),
  };
}
