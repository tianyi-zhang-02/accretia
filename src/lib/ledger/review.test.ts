import { describe, expect, it } from 'vitest';

import { ledgerSchema, type MonthEntry } from './ledger';
import { yearInReview } from './review';

const e = (year: number, month: number, x: Partial<MonthEntry> = {}): MonthEntry => ({
  year,
  month,
  income: 10_000,
  spending: 6_000,
  ...x,
});

describe('yearInReview', () => {
  it('nothing logged that year → nothing to review', () => {
    expect(yearInReview([e(2025, 1)], 2026)).toBeNull();
  });

  it('the facts worth a screenshot', () => {
    const r = yearInReview(
      ledgerSchema.parse([
        e(2025, 1, { spending: 8_000 }),
        e(2026, 1, {
          netWorth: 100_000,
          pretaxSavings: 2_000,
          breakdown: { 'housing.rent': 3_000, 'food.dining': 1_000, 'food.groceries': 2_000 },
        }),
        e(2026, 2, {
          spending: 0,
          breakdown: { 'housing.rent': 3_000, 'food.dining': 500 },
        }),
        // a gap in March, then three in a row
        e(2026, 4),
        e(2026, 5),
        e(2026, 6, { netWorth: 120_000 }),
      ]),
      2026,
      {
        budgets: { food: 2_000 },
        goals: [{ kind: 'car', target: 10, saved: 20, year: 2026, month: 12 }],
        today: { year: 2026, month: 10 },
      },
    )!;
    expect(r.monthsLogged).toBe(5);
    // kept 4,000 + 6,500 + 4,000 × 3 = 22,500; + 2,000 pre-tax
    expect(r.saved).toBe(24_500);
    expect(r.netWorth).toEqual({ start: 100_000, end: 120_000, change: 20_000 });
    expect(r.topCategory?.id).toBe('housing');
    expect(r.topItem).toEqual({ id: 'housing.rent', total: 6_000 });
    expect(r.best).toEqual({ month: 2, saved: 6_500 });
    expect(r.longestRun).toBe(3);
    // January vs January: spending 6,000 vs 8,000
    expect(r.vsLastYear?.spendingPct).toBe(-25);
    // food 3,000 in Jan (over), 500 in Feb (within)
    expect(r.budgets).toEqual({ kept: 1, of: 2 });
    expect(r.goalsReached).toBe(1);
  });
});
