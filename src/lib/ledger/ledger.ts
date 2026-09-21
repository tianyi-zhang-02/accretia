/**
 * Monthly ledger — the "what actually happened" counterpart to the
 * projection. Deliberately LIGHT: three numbers a month (take-home income,
 * spending, month-end net worth), not accounts or transactions. The old
 * full tracker was removed from this repo on purpose; this is not that.
 *
 * Everything here is pure and offline. The CSV reader is hand-rolled (no
 * dependency) and treats the file as untrusted input: size-capped, every
 * cell parsed to a bounded finite number, every row validated, bad rows
 * reported rather than guessed at.
 */

import { z } from 'zod';

import type { YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

const MONEY_CAP = 1e12;

export const monthEntrySchema = z.object({
  year: z.number().int().min(1900).max(2200),
  month: z.number().int().min(1).max(12),
  /** Take-home (after-tax) income that month. */
  income: z.number().min(0).max(MONEY_CAP),
  spending: z.number().min(0).max(MONEY_CAP),
  /** Month-end net worth. Optional — not everyone checks monthly. */
  netWorth: z.number().min(-MONEY_CAP).max(MONEY_CAP).optional(),
});
export type MonthEntry = z.infer<typeof monthEntrySchema>;

/** 50 years of months is plenty; the cap keeps stored data bounded. */
export const ledgerSchema = z.array(monthEntrySchema).max(600);

const key = (e: Pick<MonthEntry, 'year' | 'month'>) => e.year * 12 + (e.month - 1);

/** Insert or replace one month; result stays sorted and de-duplicated. */
export function upsert(entries: MonthEntry[], entry: MonthEntry): MonthEntry[] {
  const rest = entries.filter((e) => key(e) !== key(entry));
  return [...rest, entry].sort((a, b) => key(a) - key(b));
}

/** Drop a month entirely (all three fields cleared). */
export function remove(entries: MonthEntry[], year: number, month: number): MonthEntry[] {
  return entries.filter((e) => !(e.year === year && e.month === month));
}

// ---------- CSV ----------

const CSV_MAX_BYTES = 200_000;
const CSV_MAX_LINES = 1_000;

/** Header aliases — English template names plus the Chinese ones. */
const HEADERS: Record<string, keyof MonthEntry> = {
  year: 'year',
  年: 'year',
  年份: 'year',
  month: 'month',
  月: 'month',
  月份: 'month',
  income: 'income',
  收入: 'income',
  spending: 'spending',
  expenses: 'spending',
  支出: 'spending',
  开支: 'spending',
  net_worth: 'netWorth',
  networth: 'netWorth',
  'net worth': 'netWorth',
  净资产: 'netWorth',
};

/** One CSV line → cells. Handles quotes and doubled quotes; nothing else. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * A spreadsheet cell → number. Accepts what Excel actually writes
 * ("$1,234.50", "1 234", "¥5000") and NOTHING else: anything left over
 * after stripping currency marks must be a plain decimal, so formulas,
 * text and exponent tricks all come back as null.
 */
function cellToNumber(cell: string): number | null {
  const cleaned = cell.replace(/[$¥€£,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type CsvResult = {
  entries: MonthEntry[];
  /** 1-based line numbers that were skipped, with why. */
  errors: Array<{ line: number; reason: 'columns' | 'number' | 'range' }>;
  /** Set when the file as a whole was unusable. */
  fatal?: 'tooLarge' | 'noHeader';
};

export function parseLedgerCsv(text: string): CsvResult {
  if (text.length > CSV_MAX_BYTES) return { entries: [], errors: [], fatal: 'tooLarge' };
  const lines = text
    .replace(/^﻿/, '') // Excel's BOM
    .split(/\r?\n/)
    .slice(0, CSV_MAX_LINES);

  const headerIdx = lines.findIndex((l) => l.trim() !== '');
  if (headerIdx < 0) return { entries: [], errors: [], fatal: 'noHeader' };
  const cols = splitLine(lines[headerIdx]!).map((h) => HEADERS[h.toLowerCase()]);
  const at = (f: keyof MonthEntry) => cols.indexOf(f);
  if (at('year') < 0 || at('month') < 0 || at('income') < 0 || at('spending') < 0) {
    return { entries: [], errors: [], fatal: 'noHeader' };
  }

  let entries: MonthEntry[] = [];
  const errors: CsvResult['errors'] = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const cells = splitLine(raw);
    const income = cells[at('income')] ?? '';
    const spending = cells[at('spending')] ?? '';
    const nwCell = at('netWorth') >= 0 ? (cells[at('netWorth')] ?? '') : '';
    // A template row the user never filled in is not an error.
    if (income === '' && spending === '' && nwCell === '') continue;

    const year = cellToNumber(cells[at('year')] ?? '');
    const month = cellToNumber(cells[at('month')] ?? '');
    const inc = income === '' ? 0 : cellToNumber(income);
    const spend = spending === '' ? 0 : cellToNumber(spending);
    const nw = nwCell === '' ? undefined : cellToNumber(nwCell);
    if (year === null || month === null || inc === null || spend === null || nw === null) {
      errors.push({ line: i + 1, reason: 'number' });
      continue;
    }
    const parsed = monthEntrySchema.safeParse({
      year,
      month,
      income: inc,
      spending: spend,
      ...(nw === undefined ? {} : { netWorth: nw }),
    });
    if (!parsed.success) {
      errors.push({ line: i + 1, reason: 'range' });
      continue;
    }
    entries = upsert(entries, parsed.data);
  }
  return { entries: entries.slice(0, 600), errors };
}

const HEADER_ROW = 'year,month,income,spending,net_worth';

/** Numbers only, so there is nothing for a spreadsheet to execute. */
export function toCsv(entries: MonthEntry[]): string {
  const rows = entries.map((e) =>
    [e.year, e.month, e.income, e.spending, e.netWorth ?? ''].join(','),
  );
  return [HEADER_ROW, ...rows].join('\n') + '\n';
}

/** Twelve empty rows for one year — open in Excel, fill, save as CSV. */
export function templateCsv(year: number): string {
  const rows = Array.from({ length: 12 }, (_, i) => `${year},${i + 1},,,`);
  return [HEADER_ROW, ...rows].join('\n') + '\n';
}

// ---------- Year report ----------

export type YearReport = {
  year: number;
  monthsRecorded: number;
  income: number;
  spending: number;
  saved: number;
  /** saved ÷ income, %, or null with no income. */
  savingsRatePct: number | null;
  /** Per calendar month (index 0 = Jan); null where nothing was recorded. */
  monthly: Array<{ month: number; income: number; spending: number; saved: number } | null>;
  best: { month: number; saved: number } | null;
  worst: { month: number; saved: number } | null;
  /** First → last recorded month-end net worth within the year. */
  netWorth: { start: number; end: number; change: number } | null;
  /**
   * The projection's figures for the same year, scaled to the months
   * actually recorded so a half-filled year isn't compared to a whole one.
   */
  plan: { spending: number; saved: number } | null;
};

export function yearReport(entries: MonthEntry[], year: number, planRows?: YearRow[]): YearReport {
  const inYear = entries.filter((e) => e.year === year).sort((a, b) => a.month - b.month);
  const monthly: YearReport['monthly'] = Array.from({ length: 12 }, () => null);
  let income = 0;
  let spending = 0;
  for (const e of inYear) {
    income += e.income;
    spending += e.spending;
    monthly[e.month - 1] = {
      month: e.month,
      income: e.income,
      spending: e.spending,
      saved: e.income - e.spending,
    };
  }
  const recorded = monthly.filter((m): m is NonNullable<typeof m> => m !== null);
  const bySaved = [...recorded].sort((a, b) => b.saved - a.saved);
  const withNw = inYear.filter((e) => e.netWorth !== undefined);
  const planRow = planRows?.find((r) => r.year === year);
  const share = recorded.length / 12;

  return {
    year,
    monthsRecorded: recorded.length,
    income,
    spending,
    saved: income - spending,
    savingsRatePct: income > 0 ? ((income - spending) / income) * 100 : null,
    monthly,
    best: bySaved[0] ? { month: bySaved[0].month, saved: bySaved[0].saved } : null,
    worst:
      bySaved.length > 1 ? { month: bySaved.at(-1)!.month, saved: bySaved.at(-1)!.saved } : null,
    netWorth:
      withNw.length >= 2
        ? {
            start: withNw[0]!.netWorth!,
            end: withNw.at(-1)!.netWorth!,
            change: withNw.at(-1)!.netWorth! - withNw[0]!.netWorth!,
          }
        : null,
    plan:
      planRow && recorded.length > 0
        ? { spending: planRow.expenses * share, saved: planRow.saved * share }
        : null,
  };
}

/** Years that have at least one recorded month, newest first. */
export function recordedYears(entries: MonthEntry[]): number[] {
  return [...new Set(entries.map((e) => e.year))].sort((a, b) => b - a);
}

/**
 * Feed reality back into the plan: annualized actual spending becomes the
 * baseline, and the latest recorded net worth becomes the starting point.
 * Needs at least three months — one odd month shouldn't rewrite a plan.
 */
export function calibrationPatch(
  report: YearReport,
  entries: MonthEntry[],
  a: Assumptions,
): Partial<Assumptions> | null {
  if (report.monthsRecorded < 3) return null;
  const patch: Partial<Assumptions> = {
    recurringAnnualExpenses: Math.round((report.spending / report.monthsRecorded) * 12),
  };
  const latest = [...entries].reverse().find((e) => e.netWorth !== undefined);
  if (latest?.netWorth !== undefined) {
    patch.startingNetWorth = latest.netWorth;
    // Schema invariant: invested ≤ max(0, net worth).
    patch.startingInvested = Math.min(a.startingInvested, Math.max(0, latest.netWorth));
  }
  return patch;
}

// ---------- Monthly check-in ----------

export type YearMonth = { year: number; month: number };

const has = (entries: MonthEntry[], ym: YearMonth) => entries.some((e) => key(e) === key(ym));

const fromKey = (k: number): YearMonth => ({ year: Math.floor(k / 12), month: (k % 12) + 1 });

/** Step a month forwards or backwards across year boundaries. */
export function shiftMonth(ym: YearMonth, by: number): YearMonth {
  return fromKey(key(ym) + by);
}

/** True when `a` is a later month than `b`. */
export function isAfter(a: YearMonth, b: YearMonth): boolean {
  return key(a) > key(b);
}

/**
 * The month the check-in should open on. Last month is finished, so its
 * numbers are final — log that first; once it's in, move on to this month.
 */
export function checkInTarget(entries: MonthEntry[], today: YearMonth): YearMonth {
  const last = shiftMonth(today, -1);
  return has(entries, last) ? today : last;
}

/**
 * Consecutive logged months, counted back from this month (if logged) or
 * from last month — not having logged a month that isn't over yet must not
 * break a streak.
 */
export function streak(entries: MonthEntry[], today: YearMonth): number {
  let at = has(entries, today) ? today : shiftMonth(today, -1);
  let n = 0;
  while (has(entries, at) && n < 600) {
    n += 1;
    at = shiftMonth(at, -1);
  }
  return n;
}

/** Typical income / spending over the (up to) `n` logged months before `ym`. */
export function recentAverage(
  entries: MonthEntry[],
  ym: YearMonth,
  n = 3,
): { income: number; spending: number } | null {
  const prior = entries.filter((e) => key(e) < key(ym)).slice(-n);
  if (prior.length === 0) return null;
  const sum = (f: 'income' | 'spending') => prior.reduce((s, e) => s + e[f], 0) / prior.length;
  return { income: Math.round(sum('income')), spending: Math.round(sum('spending')) };
}

/**
 * What the plan expects around a given month. Engine rows are year-END
 * values, so net worth is interpolated along the year from the previous
 * year-end (or the plan's starting net worth in the first year).
 */
export function planAt(
  planRows: YearRow[],
  startingNetWorth: number,
  ym: YearMonth,
): { monthlySpending: number; monthlySaved: number; netWorth: number } | null {
  const i = planRows.findIndex((r) => r.year === ym.year);
  if (i < 0) return null;
  const row = planRows[i]!;
  const from = i === 0 ? startingNetWorth : planRows[i - 1]!.netWorth;
  return {
    monthlySpending: row.expenses / 12,
    monthlySaved: row.saved / 12,
    netWorth: from + (row.netWorth - from) * (ym.month / 12),
  };
}
