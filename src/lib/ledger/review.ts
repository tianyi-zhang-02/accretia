/**
 * The year in review — the handful of facts worth a screenshot, gathered
 * from what the report already knows: what was saved and at what rate, how
 * net worth moved, where the money went, the best month, the longest run of
 * months logged, the change on last year, budgets kept and goals reached.
 * Pure; every number comes from the ledger and the plan.
 */

import type { YearRow } from '@/lib/simulator/engine';

import type { AnnualExpense } from './annual';
import { budgetLines, type Budgets, budgetedSpend } from './budgets';
import { yearOverYear } from './compare';
import { goalStatus, type SavingsGoal } from './goals';
import {
  categoryBreakdown,
  SUB_IDS,
  totalSaved,
  yearReport,
  type CategoryId,
  type MonthEntry,
  type SubId,
  type YearMonth,
} from './ledger';

export type YearReview = {
  year: number;
  monthsLogged: number;
  /** Take-home kept + pre-tax savings. */
  saved: number;
  savingsRatePct: number | null;
  netWorth: { start: number; end: number; change: number } | null;
  topCategory: { id: CategoryId; total: number; sharePct: number } | null;
  topItem: { id: SubId; total: number } | null;
  best: { month: number; saved: number } | null;
  /** Longest run of consecutive months logged in the year. */
  longestRun: number;
  /** Against the same months last year; null without any month in both. */
  vsLastYear: { ratePts: number | null; spendingPct: number | null } | null;
  /** Months logged by category in which every budgeted category stayed within. */
  budgets: { kept: number; of: number } | null;
  /** Kept vs what the plan expected for the months logged. */
  vsPlan: number | null;
  goalsReached: number;
};

export function yearInReview(
  entries: MonthEntry[],
  year: number,
  opts: {
    planRows?: YearRow[];
    budgets?: Budgets;
    /** Once-a-year bills: planned, so not held against a month's budget. */
    annual?: AnnualExpense[];
    goals?: SavingsGoal[];
    today?: YearMonth;
  } = {},
): YearReview | null {
  const r = yearReport(entries, year, opts.planRows);
  if (r.monthsRecorded === 0) return null;
  const s = totalSaved(entries, year);
  const inYear = entries.filter((e) => e.year === year);
  const cats = categoryBreakdown(entries, year);
  const top = cats?.rows[0];

  const items = new Map<SubId, number>();
  for (const e of inYear)
    for (const id of SUB_IDS) {
      const v = e.breakdown?.[id];
      if (v) items.set(id, (items.get(id) ?? 0) + v);
    }
  const topItem = [...items.entries()].sort((a, b) => b[1] - a[1])[0];

  let longestRun = 0;
  let run = 0;
  for (let m = 1; m <= 12; m++) {
    run = r.monthly[m - 1] ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  }

  const y = yearOverYear(entries, year);
  const budgeted = opts.budgets && Object.values(opts.budgets).some((v) => (v ?? 0) > 0);
  const budgetMonths = budgeted ? inYear.filter((e) => e.categories) : [];

  return {
    year,
    monthsLogged: r.monthsRecorded,
    saved: s.total,
    savingsRatePct: s.savingsRatePct,
    netWorth: r.netWorth,
    topCategory: top ? { id: top.id, total: top.total, sharePct: top.sharePct } : null,
    topItem: topItem ? { id: topItem[0], total: Math.round(topItem[1] * 100) / 100 } : null,
    best: r.best,
    longestRun,
    vsLastYear: y
      ? {
          // Same basis as the headline rate (pre-tax savings included), over
          // the months logged in both years.
          ratePts: (() => {
            const rate = (yr: number) => {
              const es = y.months
                .map((m) => entries.find((e) => e.year === yr && e.month === m))
                .filter((e): e is MonthEntry => e !== undefined);
              const cameIn = es.reduce((t, e) => t + e.income + (e.pretaxSavings ?? 0), 0);
              const kept = es.reduce(
                (t, e) => t + e.income - e.spending + (e.pretaxSavings ?? 0),
                0,
              );
              return cameIn > 0 ? (kept / cameIn) * 100 : null;
            };
            const now = rate(year);
            const then = rate(year - 1);
            return now !== null && then !== null ? now - then : null;
          })(),
          spendingPct:
            y.then.spending > 0
              ? ((y.now.spending - y.then.spending) / y.then.spending) * 100
              : null,
        }
      : null,
    budgets: budgetMonths.length
      ? {
          kept: budgetMonths.filter((e) =>
            budgetLines(budgetedSpend(e, opts.annual), opts.budgets!).every((l) => !l.over),
          ).length,
          of: budgetMonths.length,
        }
      : null,
    // Pre-tax savings count: the plan's saving includes them.
    vsPlan: r.plan ? Math.round(r.saved + r.pretax - r.plan.saved) : null,
    // Goals are reached "now": only the current year's review counts them.
    goalsReached:
      opts.today && year === opts.today.year
        ? (opts.goals ?? []).filter((g) => goalStatus(g, opts.today!).done).length
        : 0,
  };
}
