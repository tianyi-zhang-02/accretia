import { describe, expect, it } from 'vitest';

import type { Assumptions } from '@/lib/validation/scenarios';

import { simulate } from './engine';

// 0% tax / inflation / return unless a test says otherwise. Primary person
// born 1996 → age 30 in 2026. $100k salary, $40k spend.
function mk(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    horizonStartYear: 2026,
    horizonEndYear: 2031,
    people: [
      {
        id: 'p1',
        name: 'A',
        birthYear: 1996,
        careerStages: [{ label: 'j', startAge: 30, baseSalary: 100_000, annualRaisePct: 0 }],
      },
    ],
    startingNetWorth: 0,
    startingInvested: 0,
    effectiveTaxRatePct: 0,
    investment: { returnPct: 0, returnPctLow: 0, returnPctHigh: 0 },
    inflationPct: 0,
    windfalls: [],
    majorExpenses: [],
    recurringAnnualExpenses: 40_000,
    ...overrides,
  };
}

describe('non-linear careers', () => {
  it('a $0-salary stage is a career break — income stops, then resumes at the next stage', () => {
    const a = mk();
    // Work 2026–27 at 100k → break 2028–29 → back 2030–31 at 80k (a pay cut).
    a.people[0]!.careerStages = [
      { label: 'job', startAge: 30, baseSalary: 100_000, annualRaisePct: 0 },
      { label: 'break', startAge: 32, baseSalary: 0, annualRaisePct: 0 },
      { label: 'back', startAge: 34, baseSalary: 80_000, annualRaisePct: 0 },
    ];
    const { rows } = simulate(a);
    expect(rows.map((r) => r.grossIncome)).toEqual([100_000, 100_000, 0, 0, 80_000, 80_000]);
    // Break years still pay the bills: 2 years × 40k drawn from savings.
    expect(rows[3]!.netWorth).toBe(2 * 60_000 - 2 * 40_000);
  });

  it('a negative raise models a declining salary', () => {
    const a = mk();
    a.people[0]!.careerStages = [
      { label: 'fade', startAge: 30, baseSalary: 100_000, annualRaisePct: -10 },
    ];
    const { rows } = simulate(a);
    expect(rows[0]!.grossIncome).toBe(100_000);
    expect(rows[2]!.grossIncome).toBeCloseTo(100_000 * 0.9 * 0.9, 6);
  });
});

describe('retirement realism', () => {
  it('career income stops at retireAge (people could never retire before)', () => {
    const a = mk();
    a.people[0]!.retireAge = 33; // 2029
    const { rows } = simulate(a);
    expect(rows.map((r) => r.grossIncome)).toEqual([100_000, 100_000, 100_000, 0, 0, 0]);
    // 3 years × 60k saved, then 3 years × 40k drawdown.
    expect(rows.at(-1)!.netWorth).toBe(60_000);
  });

  it('retirement is per person — the other keeps earning', () => {
    const a = mk();
    a.people.push({
      id: 'p2',
      name: 'B',
      birthYear: 1996,
      careerStages: [{ label: 'k', startAge: 30, baseSalary: 50_000, annualRaisePct: 0 }],
      retireAge: 33,
    });
    const { rows } = simulate(a);
    expect(rows[0]!.grossIncome).toBe(150_000);
    expect(rows.at(-1)!.grossIncome).toBe(100_000); // only p1 still works
  });

  it('other income streams pay from startAge to endAge, taxed like income', () => {
    const a = mk({
      effectiveTaxRatePct: 50,
      otherIncomes: [{ label: 'SS', startAge: 33, endAge: 34, annualAmount: 30_000 }],
    });
    a.people[0]!.retireAge = 33;
    const { rows } = simulate(a);
    expect(rows.map((r) => r.grossIncome)).toEqual([100_000, 100_000, 100_000, 30_000, 30_000, 0]);
    expect(rows[3]!.afterTaxIncome).toBe(15_000); // flat tax applies
  });

  it('inflation-adjusted stream grows with CPI; fixed-nominal pension does not', () => {
    const adjusted = mk({
      inflationPct: 3,
      otherIncomes: [{ label: 'SS', startAge: 30, annualAmount: 30_000 }],
      people: [{ id: 'p1', name: 'A', birthYear: 1996, careerStages: [] }],
    });
    const fixed = mk({
      inflationPct: 3,
      otherIncomes: [
        { label: 'pension', startAge: 30, annualAmount: 30_000, inflationAdjusted: false },
      ],
      people: [{ id: 'p1', name: 'A', birthYear: 1996, careerStages: [] }],
    });
    expect(simulate(adjusted).rows[0]!.grossIncome).toBeCloseTo(30_000 * 1.03, 2);
    expect(simulate(fixed).rows[0]!.grossIncome).toBe(30_000);
  });

  it('retirement.spendingPct scales the recurring baseline from the retire year', () => {
    const a = mk({ retirement: { spendingPct: 60 } });
    a.people[0]!.retireAge = 33;
    const { rows } = simulate(a);
    expect(rows[2]!.expenses).toBe(40_000); // still working
    expect(rows[3]!.expenses).toBe(24_000); // 60% in retirement
  });

  it('postReturnPct takes over at retirement and the band keeps its spread', () => {
    const a = mk({
      horizonEndYear: 2030,
      people: [{ id: 'p1', name: 'A', birthYear: 1996, careerStages: [], retireAge: 33 }],
      recurringAnnualExpenses: 0,
      startingNetWorth: 100_000,
      startingInvested: 100_000,
      investment: { returnPct: 10, returnPctLow: 5, returnPctHigh: 15 },
      retirement: { postReturnPct: 0 },
    });
    const { rows, low } = simulate(a);
    // Base: 3 years at 10%, then flat at the post-retirement 0%.
    expect(rows.at(-1)!.netWorth).toBeCloseTo(100_000 * Math.pow(1.1, 3), 2);
    // Low band: 3 years at 5%, then 0 + (5 − 10) = −5% — spread preserved.
    expect(low.at(-1)!.netWorth).toBeCloseTo(100_000 * Math.pow(1.05, 3) * Math.pow(0.95, 2), 2);
  });
});
