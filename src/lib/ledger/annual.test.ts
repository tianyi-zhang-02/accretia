import { describe, expect, it } from 'vitest';

import {
  annualIn,
  annualTotal,
  dueIn,
  dueItems,
  monthlyReserve,
  upcoming,
  type AnnualExpense,
} from './annual';

const list: AnnualExpense[] = [
  { item: 'insurance.auto', amount: 1_200, month: 11 },
  { item: 'housing.propertyTax', amount: 4_000, month: 4 },
  { item: 'housing.propertyTax', amount: 4_000, month: 12 },
  { item: 'fun.travel', amount: 3_000, month: 7 },
];

describe('annual expenses', () => {
  it('a year’s total and what to put aside each month', () => {
    expect(annualTotal(list)).toBe(12_200);
    expect(monthlyReserve(list)).toBe(1_016.67);
  });

  it('what is due in a month; the same item twice is summed', () => {
    expect(dueIn(list, 4)).toHaveLength(1);
    expect(dueItems([...list, { item: 'insurance.auto', amount: 300, month: 11 }], 11)).toEqual({
      'insurance.auto': 1_500,
    });
    expect(dueItems(list, 1)).toEqual({});
  });

  it('upcoming: nearest first, wrapping into next year', () => {
    const u = upcoming(list, { year: 2026, month: 11 });
    expect(u.map((x) => [x.item, x.year, x.month, x.monthsAway])).toEqual([
      ['insurance.auto', 2026, 11, 0],
      ['housing.propertyTax', 2026, 12, 1],
      ['housing.propertyTax', 2027, 4, 5],
    ]);
  });

  it('how much of a logged month was annual payments', () => {
    const e = {
      year: 2026,
      month: 4,
      income: 10_000,
      spending: 7_000,
      breakdown: { 'housing.propertyTax': 4_000, 'housing.mortgage': 3_000 },
    };
    expect(annualIn(e, list)).toBe(4_000);
    expect(annualIn({ ...e, month: 5 }, list)).toBe(0);
  });
});
