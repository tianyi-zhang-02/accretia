import { describe, expect, it } from 'vitest';

import { simulate } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

import { buildJourney } from './journey';

// $100k income, no tax/inflation, 0% return → predictable, rising terrain.
function mk(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    horizonStartYear: 2026,
    horizonEndYear: 2035,
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

const journeyFor = (a: Assumptions) => buildJourney(simulate(a).rows, a);

describe('buildJourney', () => {
  it('empty rows → empty journey', () => {
    expect(buildJourney([], mk())).toEqual({ points: [], landmarks: [], overcast: null });
  });

  it('terrain heights are normalized 0..1 and rise with net worth', () => {
    const { points } = journeyFor(mk());
    expect(points).toHaveLength(10);
    for (const p of points) {
      expect(p.h).toBeGreaterThanOrEqual(0);
      expect(p.h).toBeLessThanOrEqual(1);
    }
    // Monotonic savings → monotonic terrain; ends at the peak.
    expect(points.at(-1)!.h).toBe(1);
    expect(points[0]!.h).toBeLessThan(points.at(-1)!.h);
  });

  it('a flat projection sits mid-height, not at the floor', () => {
    const flat = mk({ people: [], recurringAnnualExpenses: 0, startingNetWorth: 100_000 });
    const { points } = journeyFor(flat);
    for (const p of points) expect(p.h).toBeCloseTo(Math.sqrt(0.5), 5);
  });

  it('places event landmarks at their years (home, windfall, expense, crash)', () => {
    const a = mk({
      mortgage: {
        purchaseYear: 2028,
        homePrice: 300_000,
        downPaymentPct: 20,
        mortgageRatePct: 6,
        termYears: 30,
        propertyTaxPct: 1,
      },
      windfalls: [{ label: 'bonus', year: 2030, amount: 50_000 }],
      majorExpenses: [{ label: 'car', year: 2031, amount: 30_000 }],
      stress: { marketShock: { year: 2032, returnPct: -37 } },
    });
    const { landmarks } = journeyFor(a);
    const find = (kind: string) => landmarks.find((l) => l.kind === kind);
    expect(find('home')?.year).toBe(2028);
    expect(find('windfall')?.year).toBe(2030);
    expect(find('expense')?.year).toBe(2031);
    expect(find('crash')?.year).toBe(2032);
  });

  it('adds FIRE + goal landmarks when reached in range, sorted by year', () => {
    // 60k/yr saved, 40k spend → full FIRE number 1M reached year 17;
    // shrink horizon so only coast lands in range, then widen.
    const a = mk({ horizonEndYear: 2045, target: { amount: 500_000, age: 39 } }); // 2035
    const { landmarks } = journeyFor(a);
    const kinds = landmarks.map((l) => l.kind);
    expect(kinds).toContain('goal');
    expect(kinds).toContain('coast');
    expect(kinds).toContain('full');
    const years = landmarks.map((l) => l.year);
    expect([...years].sort((x, y) => x - y)).toEqual(years);
  });

  it('drops landmarks outside the horizon', () => {
    const a = mk({ windfalls: [{ label: 'late', year: 2090, amount: 1 }] });
    expect(journeyFor(a).landmarks.find((l) => l.kind === 'windfall')).toBeUndefined();
  });

  it('expense categories map to sprites: car / second home (tiered) / boat / travel', () => {
    const a = mk({
      majorExpenses: [
        { label: '911', year: 2028, amount: 230_000, kind: 'car' },
        { label: 'beach house', year: 2029, amount: 6_000_000, kind: 'house' },
        { label: 'sailboat', year: 2030, amount: 80_000, kind: 'boat' },
        { label: 'japan trip', year: 2031, amount: 10_000, kind: 'travel' },
        { label: 'roof', year: 2032, amount: 20_000 }, // no kind → signpost
      ],
    });
    const { landmarks } = journeyFor(a);
    const at = (y: number) => landmarks.find((l) => l.year === y);
    expect(at(2028)?.kind).toBe('car');
    expect(at(2029)).toMatchObject({ kind: 'home', tier: 3 }); // 6M → mansion
    expect(at(2030)?.kind).toBe('boat');
    expect(at(2031)?.kind).toBe('travel');
    expect(at(2032)?.kind).toBe('expense');
  });

  it('mortgage house is tiered by price (1M bungalow → 3M two-story → 5M mansion)', () => {
    const withPrice = (homePrice: number) =>
      journeyFor(
        mk({
          mortgage: {
            purchaseYear: 2028,
            homePrice,
            downPaymentPct: 20,
            mortgageRatePct: 6,
            termYears: 30,
            propertyTaxPct: 1,
          },
        }),
      ).landmarks.find((l) => l.kind === 'home')?.tier;
    expect(withPrice(1_000_000)).toBe(1);
    expect(withPrice(3_000_000)).toBe(2);
    expect(withPrice(5_000_000)).toBe(3);
  });

  it('job-loss stress becomes an overcast window, clamped to the horizon', () => {
    const a = mk({ stress: { jobLoss: { startYear: 2033, years: 10, incomeReplacementPct: 0 } } });
    expect(journeyFor(a).overcast).toEqual({ fromYear: 2033, toYear: 2035 }); // horizon ends 2035
    expect(journeyFor(mk()).overcast).toBeNull();
  });
});
