/**
 * Monthly ledger — the "what actually happened" counterpart to the
 * projection. Deliberately LIGHT: three numbers a month (take-home income,
 * spending, month-end net worth). Spending can OPTIONALLY be broken into a
 * fixed set of categories (housing, insurance, …) for people who want the
 * finer picture; the total is then derived from them. Still no accounts and
 * no transactions — the old full tracker was removed on purpose.
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

/**
 * Spending categories — a FIXED list, so files, translations and reports
 * stay stable. Order is display order: the big fixed bills first.
 */
export const CATEGORY_IDS = [
  'housing',
  'utilities',
  'food',
  'transport',
  'insurance',
  'health',
  'family',
  'fun',
  'debt',
  'other',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];
export type Categories = Partial<Record<CategoryId, number>>;

/**
 * The second level: line items inside each category, the way a professional
 * budget breaks things down (housing → mortgage, property tax, HOA, …). Also
 * FIXED, for the same reasons. A sub-item's id is `category.item`.
 */
export const SUBCATEGORIES = {
  housing: ['mortgage', 'rent', 'propertyTax', 'hoa', 'maintenance'],
  utilities: ['energy', 'water', 'internet', 'phone'],
  food: ['groceries', 'dining'],
  transport: ['carPayment', 'fuel', 'transit', 'parking', 'carMaintenance'],
  insurance: ['health', 'auto', 'home', 'life', 'other'],
  health: ['medical', 'pharmacy', 'dental', 'fitness'],
  family: ['childcare', 'tuition', 'activities', 'support'],
  fun: ['travel', 'entertainment', 'shopping', 'subscriptions', 'gifts'],
  debt: ['studentLoan', 'creditCard', 'personalLoan'],
  other: ['pets', 'donations', 'taxes', 'fees', 'misc'],
} as const satisfies Record<CategoryId, readonly string[]>;

export type SubId = {
  [C in CategoryId]: `${C}.${(typeof SUBCATEGORIES)[C][number]}`;
}[CategoryId];
export type Breakdown = Partial<Record<SubId, number>>;

export const subsOf = (c: CategoryId): SubId[] =>
  SUBCATEGORIES[c].map((item) => `${c}.${item}` as SubId);
export const SUB_IDS: SubId[] = CATEGORY_IDS.flatMap(subsOf);

const money = z.number().min(0).max(MONEY_CAP);
const categoriesSchema = z
  .object(Object.fromEntries(CATEGORY_IDS.map((id) => [id, money.optional()])))
  .strict() as z.ZodType<Categories>;
const breakdownSchema = z
  .object(Object.fromEntries(SUB_IDS.map((id) => [id, money.optional()])))
  .strict() as z.ZodType<Breakdown>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum of a month's categories (0 for none). */
export function categoryTotal(c: Categories | undefined): number {
  if (!c) return 0;
  return round2(CATEGORY_IDS.reduce((s, id) => s + (c[id] ?? 0), 0));
}

/** Sum of one category's line items (0 for none). */
export function subTotal(b: Breakdown | undefined, c: CategoryId): number {
  if (!b) return 0;
  return round2(subsOf(c).reduce((s, id) => s + (b[id] ?? 0), 0));
}

/**
 * One rule, enforced wherever an entry enters the system — totals are always
 * DERIVED from the finest level that was filled in:
 *   a category with line items  = the sum of those items;
 *   spending, with categories   = the sum of the categories.
 * Empty / all-zero values vanish at both levels.
 */
function normalize<T extends { spending: number; categories?: Categories; breakdown?: Breakdown }>(
  e: T,
): T {
  if (!e.categories && !e.breakdown) return e;
  const items: Breakdown = {};
  for (const id of SUB_IDS) {
    const v = e.breakdown?.[id];
    if (v !== undefined && v > 0) items[id] = v;
  }
  const kept: Categories = {};
  for (const id of CATEGORY_IDS) {
    const fromItems = subTotal(items, id);
    const v = fromItems > 0 ? fromItems : e.categories?.[id];
    if (v !== undefined && v > 0) kept[id] = Math.min(MONEY_CAP, v);
  }
  const { categories: _c, breakdown: _b, ...rest } = e;
  void _c;
  void _b;
  if (Object.keys(kept).length === 0) return rest as T;
  return {
    ...rest,
    categories: kept,
    ...(Object.keys(items).length ? { breakdown: items } : {}),
    spending: Math.min(MONEY_CAP, categoryTotal(kept)),
  } as T;
}

export const monthEntrySchema = z
  .object({
    year: z.number().int().min(1900).max(2200),
    month: z.number().int().min(1).max(12),
    /** Take-home (after-tax) income that month. */
    income: money,
    /** Total spending. With `categories`, always their sum (see `normalize`). */
    spending: money,
    /** Month-end net worth. Optional — not everyone checks monthly. */
    netWorth: z.number().min(-MONEY_CAP).max(MONEY_CAP).optional(),
    /** Optional breakdown of `spending`. */
    categories: categoriesSchema.optional(),
    /** Optional line items inside categories; a category with items is their sum. */
    breakdown: breakdownSchema.optional(),
  })
  .transform(normalize);
export type MonthEntry = z.infer<typeof monthEntrySchema>;

/** 50 years of months is plenty; the cap keeps stored data bounded. */
export const ledgerSchema = z.array(monthEntrySchema).max(600);

const key = (e: Pick<MonthEntry, 'year' | 'month'>) => e.year * 12 + (e.month - 1);

/** Insert or replace one month; result stays sorted and de-duplicated. */
export function upsert(entries: MonthEntry[], entry: MonthEntry): MonthEntry[] {
  const rest = entries.filter((e) => key(e) !== key(entry));
  return [...rest, normalize(entry)].sort((a, b) => key(a) - key(b));
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

/** Line-item columns are matched by id (case-insensitively). */
const SUB_HEADERS: Record<string, SubId> = Object.fromEntries(
  SUB_IDS.map((id) => [id.toLowerCase(), id]),
);

/** Category column aliases — the ids themselves plus Chinese names. */
const CATEGORY_HEADERS: Record<string, CategoryId> = {
  ...Object.fromEntries(CATEGORY_IDS.map((id) => [id, id])),
  mortgage: 'housing',
  rent: 'housing',
  住房: 'housing',
  房贷: 'housing',
  房租: 'housing',
  水电网: 'utilities',
  水电: 'utilities',
  餐饮: 'food',
  吃饭: 'food',
  交通: 'transport',
  保险: 'insurance',
  医疗: 'health',
  家庭: 'family',
  教育: 'family',
  娱乐: 'fun',
  贷款: 'debt',
  其他: 'other',
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
  // A header may carry a human label after the id — "housing.hoa (HOA fees)"
  // — so the template can be readable; only the leading token is matched.
  const lead = (h: string) => h.split(/[\s(（]/)[0] ?? h;
  const headerCells = splitLine(lines[headerIdx]!).map((h) => h.toLowerCase());
  const cols = headerCells.map((h) => HEADERS[h] ?? HEADERS[lead(h)]);
  const catCols = headerCells
    .map((h, idx) => ({ id: CATEGORY_HEADERS[h] ?? CATEGORY_HEADERS[lead(h)], idx }))
    .filter((c): c is { id: CategoryId; idx: number } => c.id !== undefined);
  const subCols = headerCells
    .map((h, idx) => ({ id: SUB_HEADERS[h] ?? SUB_HEADERS[lead(h)], idx }))
    .filter((c): c is { id: SubId; idx: number } => c.id !== undefined);
  const at = (f: keyof MonthEntry) => cols.indexOf(f);
  // A detailed file may leave out `spending` — the categories add up to it.
  const hasSpending = at('spending') >= 0 || catCols.length > 0 || subCols.length > 0;
  if (at('year') < 0 || at('month') < 0 || at('income') < 0 || !hasSpending) {
    return { entries: [], errors: [], fatal: 'noHeader' };
  }

  let entries: MonthEntry[] = [];
  const errors: CsvResult['errors'] = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const cells = splitLine(raw);
    const income = cells[at('income')] ?? '';
    const spending = at('spending') >= 0 ? (cells[at('spending')] ?? '') : '';
    const nwCell = at('netWorth') >= 0 ? (cells[at('netWorth')] ?? '') : '';
    const catCells = catCols.map((c) => ({ id: c.id, cell: cells[c.idx] ?? '' }));
    const subCells = subCols.map((c) => ({ id: c.id, cell: cells[c.idx] ?? '' }));
    // A template row the user never filled in is not an error.
    if (
      income === '' &&
      spending === '' &&
      nwCell === '' &&
      catCells.every((c) => c.cell === '') &&
      subCells.every((c) => c.cell === '')
    )
      continue;

    const year = cellToNumber(cells[at('year')] ?? '');
    const month = cellToNumber(cells[at('month')] ?? '');
    const inc = income === '' ? 0 : cellToNumber(income);
    const spend = spending === '' ? 0 : cellToNumber(spending);
    const nw = nwCell === '' ? undefined : cellToNumber(nwCell);
    const categories: Categories = {};
    let badCategory = false;
    for (const c of catCells) {
      if (c.cell === '') continue;
      const n = cellToNumber(c.cell);
      if (n === null || n < 0) badCategory = true;
      // Two columns may alias one category (mortgage + rent) — add them.
      else categories[c.id] = (categories[c.id] ?? 0) + n;
    }
    const breakdown: Breakdown = {};
    for (const c of subCells) {
      if (c.cell === '') continue;
      const n = cellToNumber(c.cell);
      if (n === null || n < 0) badCategory = true;
      else breakdown[c.id] = n;
    }
    if (
      year === null ||
      month === null ||
      inc === null ||
      spend === null ||
      nw === null ||
      badCategory
    ) {
      errors.push({ line: i + 1, reason: 'number' });
      continue;
    }
    const parsed = monthEntrySchema.safeParse({
      year,
      month,
      income: inc,
      spending: spend,
      ...(nw === undefined ? {} : { netWorth: nw }),
      ...(Object.keys(categories).length ? { categories } : {}),
      ...(Object.keys(breakdown).length ? { breakdown } : {}),
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

/** How fine a CSV is: one total, a column per category, or per line item too. */
export type CsvDetail = 'simple' | 'category' | 'full';

/** Labels make the header readable — "housing.hoa (HOA fees)". Ids stay the key. */
export type CsvLabels = Partial<Record<CategoryId | SubId, string>>;

function headerRow(detail: CsvDetail, labels?: CsvLabels): string {
  const cell = (id: CategoryId | SubId) => {
    const label = labels?.[id]?.replace(/[",()（）\r\n]/g, ' ').trim();
    return label ? `${id} (${label})` : id;
  };
  return [
    HEADER_ROW,
    ...(detail === 'simple' ? [] : CATEGORY_IDS.map(cell)),
    ...(detail === 'full' ? SUB_IDS.map(cell) : []),
  ].join(',');
}

/**
 * Numbers only, so there is nothing for a spreadsheet to execute. Category
 * and line-item columns appear only when some month actually uses them.
 */
export function toCsv(entries: MonthEntry[]): string {
  const detail: CsvDetail = entries.some((e) => e.breakdown)
    ? 'full'
    : entries.some((e) => e.categories)
      ? 'category'
      : 'simple';
  const rows = entries.map((e) =>
    [
      e.year,
      e.month,
      e.income,
      e.spending,
      e.netWorth ?? '',
      ...(detail === 'simple' ? [] : CATEGORY_IDS.map((id) => e.categories?.[id] ?? '')),
      ...(detail === 'full' ? SUB_IDS.map((id) => e.breakdown?.[id] ?? '') : []),
    ].join(','),
  );
  return [headerRow(detail), ...rows].join('\n') + '\n';
}

/**
 * Twelve empty rows for one year — open in Excel, fill, save as CSV. Fill the
 * finest columns you care about and leave the totals blank: a category with
 * line items is their sum, and `spending` is the sum of the categories.
 */
export function templateCsv(
  year: number,
  detail: boolean | CsvDetail = 'simple',
  labels?: CsvLabels,
): string {
  const level: CsvDetail = detail === true ? 'category' : detail === false ? 'simple' : detail;
  const header = headerRow(level, labels);
  const blanks = ','.repeat(header.split(',').length - 2);
  const rows = Array.from({ length: 12 }, (_, i) => `${year},${i + 1}${blanks}`);
  return [header, ...rows].join('\n') + '\n';
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
        ? {
            // The engine pays for the home outside `expenses`; a person logging
            // their month counts the mortgage as spending, so the plan must too.
            spending: (planRow.expenses + (planRow.housingCosts ?? 0)) * share,
            saved: (planRow.saved - (planRow.housingCosts ?? 0)) * share,
          }
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
): {
  monthlySpending: number;
  monthlySaved: number;
  /** The home's share of `monthlySpending` (payment + tax + upkeep); 0 without one. */
  monthlyHousing: number;
  netWorth: number;
  /** Plan's mortgage balance around this month; 0 without a loan. */
  mortgageBalance: number;
} | null {
  const i = planRows.findIndex((r) => r.year === ym.year);
  if (i < 0) return null;
  const row = planRows[i]!;
  const from = i === 0 ? startingNetWorth : planRows[i - 1]!.netWorth;
  const housing = row.housingCosts ?? 0;
  const loanEnd = row.mortgageBalance ?? 0;
  // The year a loan starts there is no earlier balance to interpolate from.
  const loanFrom =
    i > 0 && planRows[i - 1]!.mortgageBalance > 0 ? planRows[i - 1]!.mortgageBalance : loanEnd;
  return {
    // The engine pays for the home outside `expenses`; people log it as spending.
    monthlySpending: (row.expenses + housing) / 12,
    monthlySaved: (row.saved - housing) / 12,
    monthlyHousing: housing / 12,
    netWorth: from + (row.netWorth - from) * (ym.month / 12),
    mortgageBalance: loanFrom + (loanEnd - loanFrom) * (ym.month / 12),
  };
}

// ---------- Category breakdown ----------

export type CategoryBreakdown = {
  /** Categories with spending this year, largest first. */
  rows: Array<{
    id: CategoryId;
    total: number;
    sharePct: number;
    monthlyAvg: number;
    /** Line items inside the category, largest first; share is of the CATEGORY. */
    items: Array<{ id: SubId; total: number; sharePct: number }>;
    /** Part of the category that was logged without line items. */
    unitemized: number;
  }>;
  /** Spending from months logged as a single total. */
  uncategorized: number;
  /** Months that carry a breakdown. */
  detailedMonths: number;
};

/** Where the year's money went. Null when no month that year has categories. */
export function categoryBreakdown(entries: MonthEntry[], year: number): CategoryBreakdown | null {
  const inYear = entries.filter((e) => e.year === year);
  const detailed = inYear.filter((e) => e.categories);
  if (detailed.length === 0) return null;
  const totalSpending = inYear.reduce((s, e) => s + e.spending, 0);
  const rows = CATEGORY_IDS.map((id) => {
    const total = round2(detailed.reduce((s, e) => s + (e.categories?.[id] ?? 0), 0));
    const items = subsOf(id)
      .map((sub) => {
        const t = round2(detailed.reduce((s, e) => s + (e.breakdown?.[sub] ?? 0), 0));
        return { id: sub, total: t, sharePct: total > 0 ? (t / total) * 100 : 0 };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
    return {
      id,
      total,
      sharePct: totalSpending > 0 ? (total / totalSpending) * 100 : 0,
      monthlyAvg: total / detailed.length,
      items,
      unitemized: items.length ? round2(total - items.reduce((s, r) => s + r.total, 0)) : 0,
    };
  })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  return {
    rows,
    uncategorized: round2(inYear.filter((e) => !e.categories).reduce((s, e) => s + e.spending, 0)),
    detailedMonths: detailed.length,
  };
}

/** Does the most recent logged month before `ym` use categories? (Picks the default mode.) */
export function prefersDetail(entries: MonthEntry[], ym: YearMonth): boolean {
  const prior = entries.filter((e) => key(e) < key(ym)).at(-1);
  return Boolean(prior?.categories);
}
