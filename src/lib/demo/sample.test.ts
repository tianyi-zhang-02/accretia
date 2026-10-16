import { describe, expect, it } from 'vitest';

import { planAt } from '@/lib/ledger/ledger';
import { yearInReview } from '@/lib/ledger/review';
import { simulate } from '@/lib/simulator/engine';

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

it('reads as a household roughly on its plan — the first thing a visitor sees', () => {
  const today = { year: 2026, month: 10 };
  const s = sampleData(today, 'Alex');
  const rows = simulate(s.assumptions).rows;
  const latest = s.ledger.at(-1)!;
  const plan = planAt(rows, s.assumptions.startingNetWorth, latest)!;
  // Net worth at or a little ahead of the plan, not far behind or absurdly ahead.
  expect(latest.netWorth! / plan.netWorth).toBeGreaterThan(1);
  expect(latest.netWorth! / plan.netWorth).toBeLessThan(1.2);
  // This year's savings within ±15% of what the plan expected.
  const vs = yearInReview(s.ledger, 2026, { planRows: rows })!.vsPlan!;
  expect(Math.abs(vs)).toBeLessThan(0.15 * 60_000);
  expect(vs).toBeGreaterThanOrEqual(0);
});
