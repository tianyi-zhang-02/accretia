import { describe, expect, it } from 'vitest';

import type { Assumptions } from '@/lib/validation/scenarios';

import { simulate } from './engine';

// No income, no expenses, 0% return / inflation — so net worth only moves
// because of the home + mortgage. One person with no career stages.
const base: Assumptions = {
  horizonStartYear: 2026,
  horizonEndYear: 2028,
  people: [{ id: 'p1', name: 'A', birthYear: 1990, careerStages: [] }],
  startingNetWorth: 500_000,
  startingInvested: 500_000,
  effectiveTaxRatePct: 0,
  investment: { returnPct: 0, returnPctLow: 0, returnPctHigh: 0 },
  inflationPct: 0,
  windfalls: [],
  majorExpenses: [],
  recurringAnnualExpenses: 0,
};

const netWorths = (a: Assumptions) => simulate(a).rows.map((r) => r.netWorth);

describe('mortgage / home', () => {
  it('no mortgage → net worth is unchanged (regression)', () => {
    expect(netWorths(base)).toEqual([500_000, 500_000, 500_000]);
    // investedBalance excludes any home; equals net worth here.
    expect(simulate(base).rows.at(-1)!.investedBalance).toBe(500_000);
  });

  it('all-cash home: down payment is net-worth-neutral; property tax is the only drag', () => {
    const a: Assumptions = {
      ...base,
      mortgage: {
        purchaseYear: 2026,
        homePrice: 200_000,
        downPaymentPct: 100, // no loan
        mortgageRatePct: 0,
        termYears: 30,
        propertyTaxPct: 1, // 1% of 200k = 2k/yr
      },
    };
    // 500k − 2k property tax each year (home equity offsets the down payment).
    expect(netWorths(a)).toEqual([498_000, 496_000, 494_000]);
  });

  it('zero-rate mortgage: principal payments just move cash into equity', () => {
    const a: Assumptions = {
      ...base,
      startingNetWorth: 200_000,
      startingInvested: 200_000,
      mortgage: {
        purchaseYear: 2026,
        homePrice: 100_000,
        downPaymentPct: 0,
        mortgageRatePct: 0, // no interest → principal is net-worth-neutral
        termYears: 2,
        propertyTaxPct: 0,
      },
    };
    expect(netWorths(a)).toEqual([200_000, 200_000, 200_000]);
  });

  it('interest is a real cost — a rate-bearing loan ends below the zero-rate one', () => {
    const withInterest: Assumptions = {
      ...base,
      startingNetWorth: 200_000,
      startingInvested: 200_000,
      mortgage: {
        purchaseYear: 2026,
        homePrice: 100_000,
        downPaymentPct: 0,
        mortgageRatePct: 10,
        termYears: 30,
        propertyTaxPct: 0,
      },
    };
    const zeroRate: Assumptions = {
      ...withInterest,
      mortgage: { ...withInterest.mortgage!, mortgageRatePct: 0 },
    };
    const iFinal = simulate(withInterest).rows.at(-1)!.netWorth;
    const zFinal = simulate(zeroRate).rows.at(-1)!.netWorth;
    expect(iFinal).toBeLessThan(zFinal);
    expect(iFinal).toBeLessThan(200_000); // interest erodes net worth
  });

  it('home appreciation lifts net worth over time', () => {
    const flat: Assumptions = {
      ...base,
      mortgage: {
        purchaseYear: 2026,
        homePrice: 200_000,
        downPaymentPct: 100,
        mortgageRatePct: 0,
        termYears: 30,
        propertyTaxPct: 0,
        homeAppreciationPct: 0,
      },
    };
    const rising: Assumptions = {
      ...flat,
      mortgage: { ...flat.mortgage!, homeAppreciationPct: 10 },
    };
    expect(simulate(rising).rows.at(-1)!.netWorth).toBeGreaterThan(
      simulate(flat).rows.at(-1)!.netWorth,
    );
  });
});
