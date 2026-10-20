import { describe, expect, it } from 'vitest';

import type { YearRow } from '@/lib/simulator/engine';

import { categoryByMonth, ledgerInsights } from './insights';
import { upsert, type MonthEntry } from './ledger';

const m = (
  month: number,
  income: number,
  spending: number,
  extra: Partial<MonthEntry> = {},
): MonthEntry => upsert([], { year: 2026, month, income, spending, ...extra } as MonthEntry)[0]!;

const ids = (r: ReturnType<typeof ledgerInsights>) => r.insights.map((i) => i.id);

describe('ledgerInsights', () => {
  it('nothing logged → nothing to say; one month → an invitation', () => {
    expect(ledgerInsights([])).toEqual({ focus: null, insights: [] });
    expect(ids(ledgerInsights([m(5, 10_000, 4_000)]))).toEqual(['firstMonth']);
  });

  it('spending vs the usual of the last three logged months', () => {
    // usual = (4000 + 4200 + 3800) / 3 = 4000; this month 5000 → +25%
    const r = ledgerInsights([
      m(5, 10_000, 4_000),
      m(6, 10_000, 4_200),
      m(7, 10_000, 3_800),
      m(8, 10_000, 5_000),
    ]);
    expect(r.focus).toEqual({ year: 2026, month: 8 });
    expect(r.insights).toContainEqual({
      id: 'spendingVsUsual',
      tone: 'warn',
      pct: 25,
      amount: 5_000,
      usual: 4_000,
    });
  });

  it('small wiggles stay quiet', () => {
    const r = ledgerInsights([m(6, 10_000, 4_000), m(7, 10_000, 4_050)]);
    expect(ids(r)).not.toContain('spendingVsUsual');
    expect(ids(r)).not.toContain('savingsRate');
  });

  it('only the past year counts as "usual"', () => {
    const old: MonthEntry = { year: 2024, month: 1, income: 10_000, spending: 1_000 };
    expect(ids(ledgerInsights([old, m(8, 10_000, 5_000)]))).toEqual([]);
  });

  it('the category that jumped, and the one that fell', () => {
    const r = ledgerInsights([
      m(6, 10_000, 0, { categories: { food: 800, fun: 600 } }),
      m(7, 10_000, 0, { categories: { food: 800, fun: 600 } }),
      m(8, 10_000, 0, { categories: { food: 1_400, fun: 200 } }),
    ]);
    expect(r.insights).toContainEqual({
      id: 'categoryJump',
      tone: 'warn',
      category: 'food',
      amount: 1_400,
      usual: 800,
    });
    expect(r.insights).toContainEqual({
      id: 'categoryDrop',
      tone: 'good',
      category: 'fun',
      amount: 200,
      usual: 600,
    });
  });

  it('savings rate vs usual, in points', () => {
    // usual 4000 kept of 10000 = 40%; now 6000 of 10000 = 60%
    const r = ledgerInsights([m(7, 10_000, 6_000), m(8, 10_000, 4_000)]);
    expect(r.insights).toContainEqual({
      id: 'savingsRate',
      tone: 'good',
      ratePct: 60,
      usualPct: 40,
    });
  });

  it('net worth since the last month it was logged', () => {
    const r = ledgerInsights([
      m(5, 1, 1, { netWorth: 100_000 }),
      m(6, 1, 1),
      m(8, 1, 1, { netWorth: 112_500 }),
    ]);
    expect(r.insights).toContainEqual({
      id: 'netWorthChange',
      tone: 'good',
      change: 12_500,
      months: 3,
    });
  });

  it('pace for the year against the plan (home costs counted as spending, like the report)', () => {
    const rows = [{ year: 2026, saved: 90_000, housingCosts: 30_000 } as YearRow];
    // kept 5000 + 5000 over 2 months → 60,000 pace; plan 90,000 − 30,000 = 60,000
    const r = ledgerInsights([m(1, 10_000, 5_000), m(2, 10_000, 5_000)], rows);
    expect(r.insights).toContainEqual({
      id: 'yearPace',
      tone: 'good',
      year: 2026,
      projected: 60_000,
      plan: 60_000,
    });
    const behind = ledgerInsights([m(1, 10_000, 6_000), m(2, 10_000, 6_000)], rows);
    expect(behind.insights.find((i) => i.id === 'yearPace')?.tone).toBe('warn');
  });

  it('a big share of splurges is pointed out', () => {
    const r = ledgerInsights([
      m(8, 10_000, 0, {
        breakdown: { 'housing.rent': 2_000, 'fun.alcohol': 300, 'transport.rideshare': 200 },
      }),
    ]);
    expect(r.insights).toContainEqual({ id: 'splurgeShare', tone: 'warn', pct: 20, amount: 500 });
  });

  it('keeps it to a few', () => {
    const r = ledgerInsights(
      [
        m(6, 10_000, 3_000, { categories: { food: 500, fun: 900 }, netWorth: 1 }),
        m(7, 10_000, 6_000, { categories: { food: 2_000, fun: 300, other: 900 }, netWorth: 2 }),
      ],
      [{ year: 2026, saved: 1, housingCosts: 0 } as YearRow],
      3,
    );
    expect(r.insights).toHaveLength(3);
  });
});

it('ranks what is new information first', () => {
  const r = ledgerInsights([
    { year: 2026, month: 6, income: 10_000, spending: 4_000, netWorth: 100_000 },
    { year: 2026, month: 7, income: 10_000, spending: 4_000, netWorth: 104_000 },
    { year: 2026, month: 8, income: 10_000, spending: 6_000, netWorth: 106_000 },
  ]);
  expect(ids(r).slice(0, 2)).toEqual(['spendingVsUsual', 'netWorthChange']);
  expect(ids(r).indexOf('netWorthChange')).toBeLessThan(ids(r).indexOf('savingsRate'));
});

describe('budgets in the findings', () => {
  it('names the category furthest over, and how many are over', () => {
    const r = ledgerInsights(
      [m(8, 10_000, 0, { categories: { food: 1_000, fun: 450, housing: 3_000 } })],
      [],
      4,
      {
        food: 800,
        fun: 300,
        housing: 3_200,
      },
    );
    expect(r.insights[0]).toEqual({
      id: 'overBudget',
      tone: 'warn',
      count: 2,
      category: 'food',
      over: 200,
    });
  });

  it('says so when everything budgeted stayed within', () => {
    const r = ledgerInsights([m(8, 10_000, 0, { categories: { food: 700 } })], [], 4, {
      food: 800,
    });
    expect(r.insights).toContainEqual({ id: 'withinBudget', tone: 'good', count: 1 });
  });

  it('a month logged as one total says nothing about budgets', () => {
    const r = ledgerInsights([m(8, 10_000, 5_000)], [], 4, { food: 800 });
    expect(ids(r).filter((i) => i.includes('Budget'))).toEqual([]);
  });
});

describe('once-a-year bills', () => {
  it('says how much of a big month was an annual bill, right after the spending line', () => {
    const r = ledgerInsights(
      [
        m(10, 10_000, 4_000),
        m(11, 10_000, 0, { breakdown: { 'insurance.auto': 1_200, 'housing.rent': 4_000 } }),
      ],
      [],
      4,
      {},
      [{ item: 'insurance.auto', amount: 1_200, month: 11 }],
    );
    expect(ids(r).slice(0, 2)).toEqual(['spendingVsUsual', 'annualDue']);
    expect(r.insights[1]).toEqual({ id: 'annualDue', tone: 'info', amount: 1_200, count: 1 });
  });

  it('nothing when the bill was not logged as its line item', () => {
    const r = ledgerInsights([m(11, 10_000, 5_200)], [], 4, {}, [
      { item: 'insurance.auto', amount: 1_200, month: 11 },
    ]);
    expect(ids(r)).not.toContain('annualDue');
  });
});

describe('the same month last year', () => {
  it('spending against the same month a year ago', () => {
    const r = ledgerInsights([
      { year: 2025, month: 8, income: 10_000, spending: 4_000 },
      m(8, 10_000, 5_000),
    ]);
    expect(r.insights).toContainEqual({
      id: 'vsLastYear',
      tone: 'warn',
      pct: 25,
      amount: 5_000,
      then: 4_000,
    });
  });

  it('quiet when it is about the same, or that month was not logged', () => {
    const same = ledgerInsights([
      { year: 2025, month: 8, income: 1, spending: 5_050 },
      m(8, 1, 5_000),
    ]);
    expect(ids(same)).not.toContain('vsLastYear');
    const other = ledgerInsights([
      { year: 2025, month: 7, income: 1, spending: 1_000 },
      m(8, 1, 5_000),
    ]);
    expect(ids(other)).not.toContain('vsLastYear');
  });
});

describe('categoryByMonth', () => {
  it('twelve slots, null where the month was not logged by category', () => {
    const entries = [
      m(1, 1, 0, { categories: { food: 500 } }),
      m(2, 1, 300),
      m(3, 1, 0, { categories: { fun: 50 } }),
    ];
    expect(categoryByMonth(entries, 2026, 'food')).toEqual([500, null, 0, ...Array(9).fill(null)]);
  });
});

describe('a month logged with only a net worth', () => {
  const list = [
    m(6, 9_000, 6_000, { netWorth: 100_000 }),
    m(7, 9_000, 6_000),
    m(8, 9_000, 6_000),
    m(9, 0, 0, { netWorth: 112_000 }),
  ];
  it('is not read as "$0 in, $0 out" — money findings come from the last month with money', () => {
    const r = ledgerInsights(list);
    expect(r.focus).toEqual({ year: 2026, month: 8 });
    expect(ids(r)).not.toContain('spendingVsUsual');
  });
  it('still reports the net worth it carries', () => {
    const nw = ledgerInsights(list).insights.find((i) => i.id === 'netWorthChange');
    expect(nw).toMatchObject({ change: 12_000, months: 3 });
  });
});

it('the year pace counts pre-tax savings, as the plan does', () => {
  const row = { year: 2026, saved: 36_000, housingCosts: 0 } as YearRow;
  // Take-home kept 1k a month + 2k to the 401(k) = exactly the plan's 3k.
  const list = [1, 2, 3].map((mo) => ({ ...m(mo, 7_000, 6_000), pretaxSavings: 2_000 }));
  const pace = ledgerInsights(list, [row]).insights.find((i) => i.id === 'yearPace');
  expect(pace).toMatchObject({ tone: 'good', projected: 36_000, plan: 36_000 });
});
