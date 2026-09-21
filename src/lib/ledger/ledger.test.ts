import { describe, expect, it } from 'vitest';

import type { YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

import {
  calibrationPatch,
  categoryBreakdown,
  categoryTotal,
  checkInTarget,
  isAfter,
  ledgerSchema,
  monthEntrySchema,
  parseLedgerCsv,
  planAt,
  prefersDetail,
  recentAverage,
  recordedYears,
  shiftMonth,
  streak,
  templateCsv,
  toCsv,
  upsert,
  yearReport,
  type MonthEntry,
} from './ledger';

const m = (month: number, income: number, spending: number, netWorth?: number): MonthEntry => ({
  year: 2026,
  month,
  income,
  spending,
  ...(netWorth === undefined ? {} : { netWorth }),
});

describe('upsert', () => {
  it('replaces the same month and keeps the list sorted', () => {
    let list = upsert([], m(3, 1, 1));
    list = upsert(list, m(1, 2, 2));
    list = upsert(list, m(3, 9, 9));
    expect(list.map((e) => [e.month, e.income])).toEqual([
      [1, 2],
      [3, 9],
    ]);
  });
});

describe('CSV — round trip and what Excel really writes', () => {
  it('round-trips through toCsv → parseLedgerCsv', () => {
    const list = [m(1, 8000, 5000, 100_000), m(2, 8000, 4200)];
    expect(parseLedgerCsv(toCsv(list)).entries).toEqual(list);
  });

  it('reads a BOM, CRLF line endings and quoted thousands separators', () => {
    const csv = '﻿year,month,income,spending,net_worth\r\n2026,1,"$8,000.50","5,000",\r\n';
    const { entries, errors } = parseLedgerCsv(csv);
    expect(errors).toEqual([]);
    expect(entries).toEqual([m(1, 8000.5, 5000)]);
  });

  it('accepts Chinese headers in any column order', () => {
    const { entries } = parseLedgerCsv('支出,收入,月,年\n4000,9000,5,2026\n');
    expect(entries).toEqual([m(5, 9000, 4000)]);
  });

  it('skips untouched template rows without calling them errors', () => {
    const { entries, errors } = parseLedgerCsv(templateCsv(2026));
    expect(entries).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('the template is twelve rows Excel cannot mangle (numeric year + month)', () => {
    const lines = templateCsv(2027).trim().split('\n');
    expect(lines).toHaveLength(13);
    expect(lines[1]).toBe('2027,1,,,');
    expect(lines[12]).toBe('2027,12,,,');
  });
});

describe('CSV — untrusted input', () => {
  it('rejects formulas, text and exponent tricks cell by cell', () => {
    const csv = [
      'year,month,income,spending',
      '2026,1,=1+1,100', // formula
      '2026,2,1e999,100', // → Infinity if naively Number()-ed
      '2026,3,lots,100', // text
      '2026,4,5000,100', // the one good row
    ].join('\n');
    const { entries, errors } = parseLedgerCsv(csv);
    expect(entries).toEqual([m(4, 5000, 100)]);
    expect(errors.map((e) => [e.line, e.reason])).toEqual([
      [2, 'number'],
      [3, 'number'],
      [4, 'number'],
    ]);
  });

  it('range-checks months and amounts', () => {
    const csv = 'year,month,income,spending\n2026,13,1,1\n2026,1,-5,1\n1500,1,1,1\n';
    const { entries, errors } = parseLedgerCsv(csv);
    expect(entries).toEqual([]);
    expect(errors.every((e) => e.reason === 'range')).toBe(true);
    expect(errors).toHaveLength(3);
  });

  it('refuses oversized files and files without the required columns', () => {
    expect(parseLedgerCsv('x'.repeat(200_001)).fatal).toBe('tooLarge');
    expect(parseLedgerCsv('date,amount\n1,2\n').fatal).toBe('noHeader');
    expect(parseLedgerCsv('').fatal).toBe('noHeader');
  });

  it('exports numbers only — nothing a spreadsheet could execute', () => {
    expect(toCsv([m(1, 1, 1, -50)])).toBe('year,month,income,spending,net_worth\n2026,1,1,1,-50\n');
  });

  it('stored data is bounded by the schema', () => {
    expect(
      ledgerSchema.safeParse([{ year: 2026, month: 1, income: Infinity, spending: 0 }]).success,
    ).toBe(false);
    expect(ledgerSchema.safeParse(Array.from({ length: 601 }, () => m(1, 1, 1))).success).toBe(
      false,
    );
  });
});

describe('yearReport', () => {
  const list = [m(1, 10_000, 6_000, 100_000), m(2, 10_000, 9_000), m(3, 10_000, 4_000, 112_000)];

  it('totals, savings rate, best and worst month', () => {
    const r = yearReport(list, 2026);
    expect(r.monthsRecorded).toBe(3);
    expect([r.income, r.spending, r.saved]).toEqual([30_000, 19_000, 11_000]);
    expect(r.savingsRatePct).toBeCloseTo((11 / 30) * 100, 6);
    expect(r.best).toEqual({ month: 3, saved: 6_000 });
    expect(r.worst).toEqual({ month: 2, saved: 1_000 });
    expect(r.monthly[1]).toEqual({ month: 2, income: 10_000, spending: 9_000, saved: 1_000 });
    expect(r.monthly[3]).toBeNull();
  });

  it('net-worth change needs two snapshots', () => {
    expect(yearReport(list, 2026).netWorth).toEqual({
      start: 100_000,
      end: 112_000,
      change: 12_000,
    });
    expect(yearReport([m(1, 1, 1, 5)], 2026).netWorth).toBeNull();
  });

  it('scales the plan to the months recorded, so a partial year compares fairly', () => {
    const rows = [{ year: 2026, expenses: 60_000, saved: 48_000 } as YearRow];
    const r = yearReport(list, 2026, rows);
    expect(r.plan).toEqual({ spending: 15_000, saved: 12_000 }); // 3/12 of the year
    expect(yearReport(list, 2026, [{ year: 2030 } as YearRow]).plan).toBeNull();
  });

  it('an empty year is all zeros, not a crash', () => {
    const r = yearReport([], 2026);
    expect(r.monthsRecorded).toBe(0);
    expect(r.savingsRatePct).toBeNull();
    expect(r.best).toBeNull();
  });

  it('lists recorded years newest first', () => {
    expect(recordedYears([{ ...m(1, 1, 1), year: 2025 }, m(1, 1, 1)])).toEqual([2026, 2025]);
  });
});

describe('calibrationPatch', () => {
  const a = { startingInvested: 80_000, startingNetWorth: 100_000 } as Assumptions;

  it('needs three months before it will touch the plan', () => {
    const two = [m(1, 10_000, 6_000), m(2, 10_000, 6_000)];
    expect(calibrationPatch(yearReport(two, 2026), two, a)).toBeNull();
  });

  it('annualizes spending and adopts the latest net worth', () => {
    const list = [m(1, 10_000, 6_000, 100_000), m(2, 10_000, 9_000), m(3, 10_000, 4_000, 112_000)];
    expect(calibrationPatch(yearReport(list, 2026), list, a)).toEqual({
      recurringAnnualExpenses: 76_000, // 19k over 3 months × 4
      startingNetWorth: 112_000,
      startingInvested: 80_000,
    });
  });

  it('clamps invested so the schema invariant survives a low or negative net worth', () => {
    const list = [m(1, 1, 1), m(2, 1, 1), m(3, 1, 1, -20_000)];
    const patch = calibrationPatch(yearReport(list, 2026), list, a)!;
    expect(patch.startingNetWorth).toBe(-20_000);
    expect(patch.startingInvested).toBe(0);
  });
});

describe('monthly check-in', () => {
  const sep = { year: 2026, month: 9 };

  it('shiftMonth crosses year boundaries both ways', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 });
    expect(shiftMonth(sep, -12)).toEqual({ year: 2025, month: 9 });
    expect(isAfter({ year: 2026, month: 10 }, sep)).toBe(true);
    expect(isAfter(sep, sep)).toBe(false);
  });

  it('opens on last month until it is logged, then on this month', () => {
    expect(checkInTarget([], sep)).toEqual({ year: 2026, month: 8 });
    expect(checkInTarget([m(8, 1, 1)], sep)).toEqual(sep);
    // January looks back into the previous year.
    expect(checkInTarget([], { year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
  });

  it('streak: an unfinished current month does not break it, a gap does', () => {
    expect(streak([], sep)).toBe(0);
    expect(streak([m(6, 1, 1), m(7, 1, 1), m(8, 1, 1)], sep)).toBe(3);
    expect(streak([m(6, 1, 1), m(7, 1, 1), m(8, 1, 1), m(9, 1, 1)], sep)).toBe(4);
    expect(streak([m(5, 1, 1), m(7, 1, 1), m(8, 1, 1)], sep)).toBe(2);
    expect(streak([m(6, 1, 1), m(7, 1, 1)], sep)).toBe(0); // last month missing
    const dec: MonthEntry = { year: 2025, month: 12, income: 1, spending: 1 };
    expect(streak([dec, m(1, 1, 1)], { year: 2026, month: 2 })).toBe(2);
  });

  it('recentAverage uses only earlier months, at most three', () => {
    expect(recentAverage([], sep)).toBeNull();
    const e = [m(4, 1000, 100), m(5, 9000, 600), m(6, 9000, 900), m(7, 12000, 1500), m(9, 1, 1)];
    expect(recentAverage(e, { year: 2026, month: 8 })).toEqual({ income: 10000, spending: 1000 });
    expect(recentAverage(e, { year: 2026, month: 4 })).toBeNull();
  });

  it('planAt interpolates net worth along the year from the previous year-end', () => {
    const row = (year: number, netWorth: number): YearRow =>
      ({ year, expenses: 120_000, saved: 60_000, netWorth }) as YearRow;
    const rows = [row(2026, 620_000), row(2027, 740_000)];
    expect(planAt(rows, 500_000, { year: 2026, month: 6 })).toEqual({
      monthlySpending: 10_000,
      monthlySaved: 5_000,
      monthlyHousing: 0,
      netWorth: 560_000,
      mortgageBalance: 0,
    });
    expect(planAt(rows, 500_000, { year: 2027, month: 12 })?.netWorth).toBe(740_000);
    expect(planAt(rows, 500_000, { year: 2027, month: 3 })?.netWorth).toBe(650_000);
    expect(planAt(rows, 500_000, { year: 2030, month: 1 })).toBeNull();
  });
});

describe('spending categories', () => {
  const detailed = (month: number, categories: MonthEntry['categories']): MonthEntry => ({
    year: 2026,
    month,
    income: 10_000,
    spending: 0,
    categories,
  });

  it('spending is always the sum of the categories, however the entry arrives', () => {
    const [e] = upsert([], {
      ...detailed(3, { housing: 3200, insurance: 410.5, food: 900 }),
      spending: 1,
    });
    expect(e!.spending).toBe(4510.5);
    const parsed = monthEntrySchema.parse({
      year: 2026,
      month: 3,
      income: 1,
      spending: 999_999,
      categories: { housing: 2000, other: 50 },
    });
    expect(parsed.spending).toBe(2050);
    expect(categoryTotal(undefined)).toBe(0);
  });

  it('empty or all-zero categories vanish and leave the typed total alone', () => {
    const [e] = upsert([], { ...detailed(3, { housing: 0 }), spending: 4000 });
    expect(e!.categories).toBeUndefined();
    expect(e!.spending).toBe(4000);
  });

  it('rejects unknown categories and negative amounts', () => {
    const base = { year: 2026, month: 1, income: 1, spending: 1 };
    expect(monthEntrySchema.safeParse({ ...base, categories: { yachts: 5 } }).success).toBe(false);
    expect(monthEntrySchema.safeParse({ ...base, categories: { food: -5 } }).success).toBe(false);
  });

  it('CSV: a detailed file round-trips, and may omit the spending column', () => {
    const entries = [detailed(1, { housing: 3200, insurance: 400 }), m(2, 9000, 4000, 100_000)].map(
      (e) => upsert([], e)[0]!,
    );
    const csv = toCsv(entries);
    expect(csv.split('\n')[0]).toBe(
      'year,month,income,spending,net_worth,housing,utilities,food,transport,insurance,health,family,fun,debt,other',
    );
    expect(parseLedgerCsv(csv).entries).toEqual(entries);

    const noTotal = parseLedgerCsv('year,month,income,房贷,保险\n2026,1,10000,"3,200",400\n');
    expect(noTotal.errors).toEqual([]);
    expect(noTotal.entries[0]).toMatchObject({
      spending: 3600,
      categories: { housing: 3200, insurance: 400 },
    });
    // A simple-only ledger keeps the simple header.
    expect(toCsv([m(1, 1, 1)]).split('\n')[0]).toBe('year,month,income,spending,net_worth');
  });

  it('CSV: aliased columns add up; junk in a category cell skips the line', () => {
    const r = parseLedgerCsv(
      'year,month,income,mortgage,rent,food\n2026,1,1,1000,500,=1+1\n2026,2,1,1000,500,\n',
    );
    expect(r.errors).toEqual([{ line: 2, reason: 'number' }]);
    expect(r.entries[0]!.categories).toEqual({ housing: 1500 });
  });

  it('detailed template has a column per category and twelve blank rows', () => {
    const lines = templateCsv(2026, true).trim().split('\n');
    expect(lines).toHaveLength(13);
    expect(lines[0]!.split(',')).toHaveLength(15);
    expect(lines[1]!.split(',')).toHaveLength(15);
    expect(parseLedgerCsv(templateCsv(2026, true)).entries).toEqual([]);
  });

  it('categoryBreakdown: largest first, shares of ALL spending, simple months counted apart', () => {
    const entries = [
      detailed(1, { housing: 3000, food: 1000 }),
      detailed(2, { housing: 3000, insurance: 1000 }),
      m(3, 9000, 2000),
    ].reduce<MonthEntry[]>((acc, e) => upsert(acc, e), []);
    const b = categoryBreakdown(entries, 2026)!;
    expect(b.rows.map((r) => r.id)).toEqual(['housing', 'food', 'insurance']);
    expect(b.rows[0]).toMatchObject({ total: 6000, sharePct: 60, monthlyAvg: 3000 });
    expect(b.uncategorized).toBe(2000);
    expect(b.detailedMonths).toBe(2);
    expect(categoryBreakdown([m(3, 9000, 2000)], 2026)).toBeNull();
  });

  it('prefersDetail follows the most recent earlier month', () => {
    const entries = [m(1, 1, 1), upsert([], detailed(2, { food: 5 }))[0]!];
    expect(prefersDetail(entries, { year: 2026, month: 3 })).toBe(true);
    expect(prefersDetail(entries, { year: 2026, month: 2 })).toBe(false);
    expect(prefersDetail([], { year: 2026, month: 3 })).toBe(false);
  });

  it('plan comparisons count the home as spending, like a person would', () => {
    const rows = [
      {
        year: 2026,
        expenses: 60_000,
        saved: 90_000,
        netWorth: 1,
        housingCosts: 36_000,
        mortgageBalance: 400_000,
      },
    ] as YearRow[];
    expect(planAt(rows, 0, { year: 2026, month: 12 })).toMatchObject({
      monthlySpending: 8_000,
      monthlySaved: 4_500,
      monthlyHousing: 3_000,
      mortgageBalance: 400_000,
    });
    const report = yearReport([m(1, 10_000, 8_000)], 2026, rows);
    expect(report.plan).toEqual({ spending: 8_000, saved: 4_500 });
  });
});
