import { describe, expect, it } from 'vitest';

import { yearOverYear } from './compare';
import type { MonthEntry } from './ledger';

const e = (year: number, month: number, x: Partial<MonthEntry> = {}): MonthEntry => ({
  year,
  month,
  income: 10_000,
  spending: 5_000,
  ...x,
});

describe('yearOverYear', () => {
  it('nothing to compare without a month logged in both years', () => {
    expect(yearOverYear([e(2026, 1), e(2025, 2)], 2026)).toBeNull();
  });

  it('like for like: only months logged in both years count', () => {
    const r = yearOverYear(
      [
        e(2025, 1, { spending: 4_000 }),
        e(2025, 2, { spending: 4_000 }),
        e(2025, 3, { spending: 9_999 }), // not logged this year → left out
        e(2026, 1, { spending: 5_000 }),
        e(2026, 2, { spending: 5_000 }),
      ],
      2026,
    )!;
    expect(r.months).toEqual([1, 2]);
    expect(r.now).toMatchObject({ income: 20_000, spending: 10_000, kept: 10_000 });
    expect(r.then).toMatchObject({ income: 20_000, spending: 8_000, kept: 12_000 });
    expect(r.now.savingsRatePct).toBe(50);
    expect(r.then.savingsRatePct).toBe(60);
  });

  it('categories over months categorized in both years, biggest move first', () => {
    const r = yearOverYear(
      [
        e(2025, 5, { categories: { food: 600, fun: 500, housing: 3_000 } }),
        e(2026, 5, { categories: { food: 900, fun: 450, housing: 3_000, health: 100 } }),
        e(2025, 6), // one total last year → not in the category comparison
        e(2026, 6, { categories: { food: 9_000 } }),
      ],
      2026,
    )!;
    expect(r.categoryMonths).toBe(1);
    expect(r.categories.map((c) => c.id)).toEqual(['food', 'health', 'fun', 'housing']);
    expect(r.categories[0]).toEqual({ id: 'food', now: 900, then: 600, diff: 300, pct: 50 });
    expect(r.categories[1]!.pct).toBeNull(); // nothing on health last year
  });

  it('net worth: the latest month logged with it in both years', () => {
    const r = yearOverYear(
      [
        e(2025, 3, { netWorth: 100_000 }),
        e(2025, 4, { netWorth: 104_000 }),
        e(2026, 3, { netWorth: 150_000 }),
        e(2026, 4),
      ],
      2026,
    )!;
    expect(r.netWorth).toEqual({ month: 3, now: 150_000, then: 100_000, change: 50_000 });
  });
});
