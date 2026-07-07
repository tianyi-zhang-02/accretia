import { describe, expect, it } from 'vitest';

import type { Assumptions, StressConfig } from '@/lib/validation/scenarios';

import { simulate } from './engine';

/**
 * Clean setup: 0% tax, 0% inflation, 0% return, no expenses. So each year
 * saved = salary, net worth just accumulates salary on top of the start.
 * One earner making a flat $100k from age 30.
 */
const base: Assumptions = {
  horizonStartYear: 2026,
  horizonEndYear: 2030, // 5 years
  people: [
    {
      id: 'p1',
      name: 'A',
      birthYear: 1996, // age 30 in 2026
      careerStages: [{ label: 'job', startAge: 30, baseSalary: 100_000, annualRaisePct: 0 }],
    },
  ],
  startingNetWorth: 100_000,
  startingInvested: 100_000,
  effectiveTaxRatePct: 0,
  investment: { returnPct: 0, returnPctLow: 0, returnPctHigh: 0 },
  inflationPct: 0,
  windfalls: [],
  majorExpenses: [],
  recurringAnnualExpenses: 0,
};

const finalNetWorth = (a: Assumptions, s?: StressConfig) => simulate(a, s).rows.at(-1)!.netWorth;

describe('stress test (engine overlay)', () => {
  it('baseline: no stress accumulates salary each year', () => {
    // 100k start + 5 × 100k saved = 600k
    expect(finalNetWorth(base)).toBe(600_000);
  });

  it('an undefined / empty stress is identical to baseline', () => {
    expect(finalNetWorth(base, undefined)).toBe(600_000);
    expect(finalNetWorth(base, {})).toBe(600_000);
  });

  it('job loss zeroes income during the window', () => {
    const stress: StressConfig = {
      jobLoss: { startYear: 2027, years: 2, incomeReplacementPct: 0 },
    };
    const result = simulate(base, stress);
    // 2027 + 2028 contribute nothing → 600k − 200k = 400k
    expect(result.rows.at(-1)!.netWorth).toBe(400_000);
    const y2027 = result.rows.find((r) => r.year === 2027)!;
    expect(y2027.grossIncome).toBe(0);
    expect(y2027.netWorth).toBe(200_000);
  });

  it('partial replacement (severance / pay cut) only reduces income', () => {
    const stress: StressConfig = {
      jobLoss: { startYear: 2027, years: 2, incomeReplacementPct: 50 },
    };
    // two years at 50k instead of 100k → lose 100k total → 500k
    expect(finalNetWorth(base, stress)).toBe(500_000);
  });

  it('job loss scoped to a personId leaves others untouched', () => {
    const stress: StressConfig = {
      jobLoss: { personId: 'someone-else', startYear: 2027, years: 5, incomeReplacementPct: 0 },
    };
    expect(finalNetWorth(base, stress)).toBe(600_000); // p1 not affected
  });

  it('market shock overrides the return for that one year only', () => {
    const stress: StressConfig = { marketShock: { year: 2028, returnPct: -50 } };
    const result = simulate(base, stress);
    const y2028 = result.rows.find((r) => r.year === 2028)!;
    // start-of-2028 balance is 300k; −50% → −150k growth that year
    expect(y2028.investmentGrowth).toBe(-150_000);
    // 600k baseline − 150k crash = 450k
    expect(result.rows.at(-1)!.netWorth).toBe(450_000);
  });
});
