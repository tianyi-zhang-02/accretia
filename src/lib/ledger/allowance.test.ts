import { describe, expect, it } from 'vitest';

import type { YearRow } from '@/lib/simulator/engine';

import { monthAllowance } from './allowance';
import type { MonthEntry } from './ledger';

// A plan year spending 60,000 (+ no home) → 5,000 a month.
const rows = [
  { year: 2026, expenses: 60_000, saved: 60_000, housingCosts: 0, netWorth: 1 } as YearRow,
];

const month = (m: number, extra: Partial<MonthEntry> = {}): MonthEntry => ({
  year: 2026,
  month: m,
  income: 10_000,
  spending: 0,
  ...extra,
});

describe('monthAllowance', () => {
  it('plan − repeating bills − the annual reserve = what is left for everyday', () => {
    const fixedBills = { 'housing.rent': 3_000, 'insurance.auto': 100 } as const;
    const a = monthAllowance(
      [
        month(8, { spending: 4_100, breakdown: { ...fixedBills, 'food.groceries': 1_000 } }),
        month(9, { spending: 4_300, breakdown: { ...fixedBills, 'food.groceries': 1_200 } }),
      ],
      { year: 2026, month: 10 },
      rows,
      0,
      [{ item: 'fun.travel', amount: 1_200, month: 7 }],
    )!;
    expect(a.plan).toBe(5_000);
    expect(a.fixed).toBe(3_100); // groceries changed → not fixed
    expect(a.annualReserve).toBe(100);
    expect(a.flexible).toBe(1_800);
    // everyday spending actually was 1,000 and 1,200
    expect(a.usualFlexible).toBe(1_100);
  });

  it('an annual bill that landed is not counted as everyday spending', () => {
    const a = monthAllowance(
      [
        month(6, { spending: 900, breakdown: { 'food.groceries': 900 } }),
        month(7, { spending: 4_100, breakdown: { 'food.groceries': 1_100, 'fun.travel': 3_000 } }),
      ],
      { year: 2026, month: 8 },
      rows,
      0,
      [{ item: 'fun.travel', amount: 3_000, month: 7 }],
    )!;
    // (900 + (4,100 − 3,000)) / 2
    expect(a.usualFlexible).toBe(1_000);
  });

  it('no plan for the year → nothing to say', () => {
    expect(monthAllowance([], { year: 2030, month: 1 }, rows, 0)).toBeNull();
  });
});

it("a planned car doesn't make every month of its year richer", () => {
  // The plan's year holds 60k of everyday spending + a 60k car.
  const withCar = [{ ...rows[0]!, expenses: 120_000, saved: 0 } as YearRow];
  const car = [{ label: 'Car', year: 2026, amount: 60_000 }];
  const a = monthAllowance([], { year: 2026, month: 10 }, withCar, 0, [], car)!;
  expect(a.plan).toBe(5_000);
  // Without telling it about the car, it would have read 10,000 a month.
  expect(monthAllowance([], { year: 2026, month: 10 }, withCar, 0)!.plan).toBe(10_000);
});
