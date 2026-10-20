import { describe, expect, it } from 'vitest';

import { inTodaysDollars, todayFactor } from './today';
import type { SimulationResult, YearRow } from './engine';

describe("today's dollars for an older plan", () => {
  it('a plan starting this year (or later) needs no scaling', () => {
    expect(todayFactor({ horizonStartYear: 2026, inflationPct: 3 }, 2026)).toBe(1);
    expect(todayFactor({ horizonStartYear: 2027, inflationPct: 3 }, 2026)).toBe(1);
  });

  it('a plan from two years ago scales by two years of inflation', () => {
    expect(todayFactor({ horizonStartYear: 2024, inflationPct: 3 }, 2026)).toBeCloseTo(1.0609, 6);
  });

  it('scales only the real figures', () => {
    const row = {
      year: 2030,
      netWorth: 500,
      netWorthRealTodayDollars: 100,
      homeEquityRealTodayDollars: 10,
    } as YearRow;
    const r: SimulationResult = { rows: [row], low: [row], high: [row] };
    const out = inTodaysDollars(r, 2);
    expect(out.rows[0]!.netWorthRealTodayDollars).toBe(200);
    expect(out.high[0]!.homeEquityRealTodayDollars).toBe(20);
    expect(out.rows[0]!.netWorth).toBe(500);
    expect(inTodaysDollars(r, 1)).toBe(r);
  });
});
