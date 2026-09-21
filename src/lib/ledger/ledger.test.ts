import { describe, expect, it } from 'vitest';

import type { YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

import {
  calibrationPatch,
  ledgerSchema,
  parseLedgerCsv,
  recordedYears,
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
