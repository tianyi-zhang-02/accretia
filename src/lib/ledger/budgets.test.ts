import { describe, expect, it } from 'vitest';

import { assumptionsSchema } from '@/lib/validation/scenarios';
import { defaultAssumptions } from '@/components/simulator/default-assumptions';

import { budgetLines, budgetTotal, monthBudget, suggestBudgets, yearBudget } from './budgets';
import { upsert, type MonthEntry } from './ledger';

const m = (month: number, categories: MonthEntry['categories']): MonthEntry =>
  upsert([], { year: 2026, month, income: 0, spending: 0, categories } as MonthEntry)[0]!;

describe('budgets', () => {
  it('live on the plan, validated, and optional', () => {
    const a = { ...defaultAssumptions(), monthlyBudgets: { food: 800, fun: 300 } };
    expect(assumptionsSchema.parse(a).monthlyBudgets).toEqual({ food: 800, fun: 300 });
    expect(assumptionsSchema.safeParse({ ...a, monthlyBudgets: { food: -1 } }).success).toBe(false);
    expect(assumptionsSchema.parse(defaultAssumptions()).monthlyBudgets).toBeUndefined();
  });

  it('a month against its budgets: left, used, over', () => {
    const lines = monthBudget(m(9, { food: 950, fun: 120, housing: 3_200 }), {
      food: 800,
      fun: 300,
    })!;
    expect(lines).toEqual([
      { id: 'food', budget: 800, spent: 950, left: -150, usedPct: 118.75, over: true },
      { id: 'fun', budget: 300, spent: 120, left: 180, usedPct: 40, over: false },
    ]);
    expect(
      monthBudget({ year: 2026, month: 9, income: 0, spending: 500 }, { food: 800 }),
    ).toBeNull();
  });

  it('a budgeted category with nothing spent is simply all left', () => {
    expect(budgetLines({}, { health: 100 })).toEqual([
      { id: 'health', budget: 100, spent: 0, left: 100, usedPct: 0, over: false },
    ]);
  });

  it('suggests the recent average, rounded to $10, from months before the one asked about', () => {
    const entries = [
      m(6, { food: 810 }),
      m(7, { food: 790, fun: 95 }),
      m(8, { food: 800 }),
      m(9, { food: 5_000 }),
    ];
    expect(suggestBudgets(entries, { year: 2026, month: 9 })).toEqual({ food: 800, fun: 30 });
    expect(suggestBudgets([], { year: 2026, month: 9 })).toEqual({});
    expect(budgetTotal({ food: 800, fun: 30 })).toBe(830);
  });

  it('a year: budget × months logged by category', () => {
    const entries = [
      m(1, { food: 700 }),
      m(2, { food: 900 }),
      { year: 2026, month: 3, income: 0, spending: 999 },
    ] as MonthEntry[];
    expect(yearBudget(entries, 2026, { food: 800 })).toEqual({
      months: 2,
      lines: [{ id: 'food', budget: 1_600, spent: 1_600, left: 0, usedPct: 100, over: false }],
    });
    expect(yearBudget(entries, 2025, { food: 800 })).toBeNull();
  });
});
