import { describe, expect, it } from 'vitest';

import type { Assumptions } from '@/lib/validation/scenarios';

import { buildInsights, type Insight } from './insights';

// A saver who reaches FIRE comfortably: $200k income, $60k spend, 6%/3%.
function base(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    horizonStartYear: 2026,
    horizonEndYear: 2066,
    people: [
      {
        id: 'p1',
        name: 'A',
        birthYear: 1996,
        careerStages: [{ label: 'job', startAge: 30, baseSalary: 200_000, annualRaisePct: 3 }],
      },
    ],
    startingNetWorth: 100_000,
    startingInvested: 100_000,
    effectiveTaxRatePct: 30,
    investment: { returnPct: 6, returnPctLow: 3, returnPctHigh: 9 },
    inflationPct: 3,
    windfalls: [],
    majorExpenses: [],
    recurringAnnualExpenses: 60_000,
    ...overrides,
  };
}

const find = <K extends Insight['id']>(list: Insight[], id: K) =>
  list.find((i) => i.id === id) as Extract<Insight, { id: K }> | undefined;

describe('insight engine', () => {
  it('leads with the FIRE age and ranks it first', () => {
    const list = buildInsights(base());
    expect(list[0]!.id).toBe('fireAge');
    const headline = find(list, 'fireAge')!;
    expect(headline.age).toBeGreaterThan(30);
    expect(headline.year).toBe(1996 + headline.age);
  });

  it('measures the spending lever in real years and ships an applicable patch', () => {
    const a = base();
    const lever = find(buildInsights(a), 'spendLess')!;
    expect(lever.years).toBeGreaterThanOrEqual(1);
    // The patch is exactly what it claims: applying it reproduces newAge.
    const applied = buildInsights({ ...a, ...lever.patch });
    expect(find(applied, 'fireAge')!.age).toBe(lever.newAge);
  });

  it('prices lifestyle creep only when the user turned it on', () => {
    expect(find(buildInsights(base()), 'dropCreep')).toBeUndefined();
    const creepy = base({
      lifestyle: { mode: 'incomeScaled', lifestyleCreepPct: 0, creepShareOfRaisePct: 50 },
    });
    const lever = find(buildInsights(creepy), 'dropCreep');
    // Creep either costs measurable years or isn't reported at all — never
    // a claim of zero impact.
    if (lever) expect(lever.years).toBeGreaterThanOrEqual(1);
  });

  it('flags an un-invested cash pile and prices the invested-share lever', () => {
    const a = base({ startingNetWorth: 400_000, startingInvested: 100_000, investedSharePct: 50 });
    const list = buildInsights(a);
    expect(find(list, 'cashDrag')!.sharePct).toBe(75);
    const lever = find(list, 'investMore');
    if (lever) expect(lever.patch.investedSharePct).toBe(60);
  });

  it('reality-checks an unsustainable savings rate and an optimistic return', () => {
    const a = base({
      recurringAnnualExpenses: 20_000,
      investment: { returnPct: 12, returnPctLow: 8, returnPctHigh: 16 },
    });
    const list = buildInsights(a);
    expect(find(list, 'savingsRateHigh')!.ratePct).toBeGreaterThan(60);
    expect(find(list, 'returnOptimistic')!.returnPct).toBe(12);
    // Reality checks carry no patch — there is nothing to "apply".
    expect(list.filter((i) => i.id === 'savingsRateHigh').every((i) => !('patch' in i))).toBe(true);
  });

  it('says so when FIRE is never reached, instead of inventing an age', () => {
    // Spending grows with income, and income barely clears it.
    const list = buildInsights(base({ recurringAnnualExpenses: 139_000 }));
    expect(list[0]!.id).toBe('fireNever');
    expect(find(list, 'fireAge')).toBeUndefined();
  });

  it('prices a market crash and notes nobody retires', () => {
    const list = buildInsights(base());
    const crash = find(list, 'crashCost');
    if (crash) expect(crash.years).toBeGreaterThanOrEqual(1);
    expect(find(list, 'noRetireAge')).toBeDefined();
  });

  it('is sorted by measured impact, headline aside', () => {
    const ranks = buildInsights(base()).map((i) => i.rank);
    expect(ranks).toEqual([...ranks].sort((x, y) => y - x));
  });

  it('returns nothing for an empty scenario rather than throwing', () => {
    expect(buildInsights(base({ people: [] }))).toEqual([]);
  });
});
