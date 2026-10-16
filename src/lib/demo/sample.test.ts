import { describe, expect, it } from 'vitest';

import { yearInReview } from '@/lib/ledger/review';

import { SAMPLE_MONTHS, sampleData } from './sample';

describe('sample data', () => {
  const today = { year: 2026, month: 10 };
  const s = sampleData(today, 'Alex');

  it('ends last month, with every month detailed and valid', () => {
    expect(s.ledger).toHaveLength(SAMPLE_MONTHS);
    expect(s.ledger.at(-1)).toMatchObject({ year: 2026, month: 9 });
    expect(s.ledger.every((e) => e.breakdown && e.incomeSources && e.netWorth)).toBe(true);
  });

  it('is the same every time (seeded)', () => {
    expect(sampleData(today, 'Alex')).toEqual(s);
  });

  it('exercises the features: budgets, yearly bills, goals, a year to review', () => {
    expect(Object.keys(s.assumptions.monthlyBudgets ?? {})).toHaveLength(3);
    expect(s.assumptions.annualExpenses).toHaveLength(2);
    expect(s.assumptions.savingsGoals).toHaveLength(2);
    expect(yearInReview(s.ledger, 2026)?.monthsLogged).toBe(9);
  });

  it('saves a believable share of income', () => {
    const r = yearInReview(s.ledger, 2026)!;
    expect(r.savingsRatePct).toBeGreaterThan(30);
    expect(r.savingsRatePct).toBeLessThan(65);
  });
});
