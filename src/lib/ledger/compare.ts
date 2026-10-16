/**
 * This year against last year — like for like. Only months logged in BOTH
 * years are compared (three logged months this year against a full last
 * year would say nothing), and categories only over months logged by
 * category in both. Pure; reads the ledger, changes nothing.
 */

import { CATEGORY_IDS, type CategoryId, type MonthEntry } from './ledger';

export type YearSide = {
  income: number;
  spending: number;
  kept: number;
  savingsRatePct: number | null;
};

export type CategoryChange = {
  id: CategoryId;
  now: number;
  then: number;
  diff: number;
  /** % change; null when last year was 0. */
  pct: number | null;
};

export type YearOverYear = {
  year: number;
  /** Calendar months (1–12) logged in both years. */
  months: number[];
  now: YearSide;
  then: YearSide;
  /** Months logged by category in both years. */
  categoryMonths: number;
  /** Biggest moves first. Empty when no month was categorized in both. */
  categories: CategoryChange[];
  /** Latest net worth this year vs the same month last year, when both were logged. */
  netWorth: { month: number; now: number; then: number; change: number } | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function side(es: MonthEntry[]): YearSide {
  const income = round2(es.reduce((t, e) => t + e.income, 0));
  const spending = round2(es.reduce((t, e) => t + e.spending, 0));
  return {
    income,
    spending,
    kept: round2(income - spending),
    savingsRatePct: income > 0 ? ((income - spending) / income) * 100 : null,
  };
}

export function yearOverYear(entries: MonthEntry[], year: number): YearOverYear | null {
  const at = (y: number, m: number) => entries.find((e) => e.year === y && e.month === m);
  const months = Array.from({ length: 12 }, (_, i) => i + 1).filter(
    (m) => at(year, m) && at(year - 1, m),
  );
  if (months.length === 0) return null;
  const now = months.map((m) => at(year, m)!);
  const then = months.map((m) => at(year - 1, m)!);

  const catMonths = months.filter((m) => at(year, m)!.categories && at(year - 1, m)!.categories);
  const sum = (y: number, id: CategoryId) =>
    round2(catMonths.reduce((t, m) => t + (at(y, m)!.categories?.[id] ?? 0), 0));
  const categories = catMonths.length
    ? CATEGORY_IDS.map((id) => {
        const n = sum(year, id);
        const p = sum(year - 1, id);
        return {
          id,
          now: n,
          then: p,
          diff: round2(n - p),
          pct: p > 0 ? ((n - p) / p) * 100 : null,
        };
      })
        .filter((c) => c.now > 0 || c.then > 0)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    : [];

  const nwMonth = [...months]
    .reverse()
    .find((m) => at(year, m)!.netWorth !== undefined && at(year - 1, m)!.netWorth !== undefined);
  return {
    year,
    months,
    now: side(now),
    then: side(then),
    categoryMonths: catMonths.length,
    categories,
    netWorth:
      nwMonth !== undefined
        ? {
            month: nwMonth,
            now: at(year, nwMonth)!.netWorth!,
            then: at(year - 1, nwMonth)!.netWorth!,
            change: round2(at(year, nwMonth)!.netWorth! - at(year - 1, nwMonth)!.netWorth!),
          }
        : null,
  };
}
