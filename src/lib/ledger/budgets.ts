/**
 * Monthly budgets per category — set on the plan (`monthlyBudgets`), checked
 * against what was logged. Pure; nothing here changes the projection.
 */

import { dueItems, type AnnualExpense } from './annual';
import {
  CATEGORY_IDS,
  type CategoryId,
  type MonthEntry,
  type SubId,
  type YearMonth,
} from './ledger';

export type Budgets = Partial<Record<CategoryId, number>>;

export type BudgetLine = {
  id: CategoryId;
  budget: number;
  spent: number;
  /** budget − spent; negative when over. */
  left: number;
  /** spent ÷ budget, %. */
  usedPct: number;
  over: boolean;
};

const key = (e: { year: number; month: number }) => e.year * 12 + (e.month - 1);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Only categories with a budget; in display order. */
export function budgetLines(
  spent: Partial<Record<CategoryId, number>>,
  budgets: Budgets,
): BudgetLine[] {
  return CATEGORY_IDS.flatMap((id) => {
    const budget = budgets[id];
    if (!budget || budget <= 0) return [];
    const s = spent[id] ?? 0;
    return [
      {
        id,
        budget,
        spent: round2(s),
        left: round2(budget - s),
        usedPct: (s / budget) * 100,
        over: s > budget + 0.004,
      },
    ];
  });
}

/**
 * A month's spending by category as a BUDGET sees it: less the once-a-year
 * bills due that month and logged on their line item. Those are planned
 * (the plan's yearly spending holds them) — a registered $2,600 trip in
 * August is not "Fun went $2,232 over budget".
 */
export function budgetedSpend(
  e: MonthEntry,
  annual: AnnualExpense[] = [],
): Partial<Record<CategoryId, number>> {
  const out: Partial<Record<CategoryId, number>> = { ...(e.categories ?? {}) };
  for (const id of Object.keys(dueItems(annual, e.month)) as SubId[]) {
    const v = e.breakdown?.[id];
    if (!v) continue;
    const c = id.split('.')[0] as CategoryId;
    out[c] = Math.max(0, (out[c] ?? 0) - v);
  }
  return out;
}

/** One logged month against the budgets. Null when it wasn't logged by category. */
export function monthBudget(
  e: MonthEntry | undefined,
  budgets: Budgets,
  annual: AnnualExpense[] = [],
): BudgetLine[] | null {
  if (!e?.categories) return null;
  return budgetLines(budgetedSpend(e, annual), budgets);
}

/**
 * A starting point: the average of the (up to) three most recent months
 * logged by category before `ym`, rounded to a friendly $10. Categories that
 * were empty throughout are left out.
 */
export function suggestBudgets(entries: MonthEntry[], ym: YearMonth): Budgets {
  const recent = entries
    .filter((e) => e.categories && key(e) < key(ym))
    .sort((a, b) => key(a) - key(b))
    .slice(-3);
  if (recent.length === 0) return {};
  const out: Budgets = {};
  for (const id of CATEGORY_IDS) {
    const avg = recent.reduce((t, e) => t + (e.categories?.[id] ?? 0), 0) / recent.length;
    if (avg > 0) out[id] = Math.max(10, Math.round(avg / 10) * 10);
  }
  return out;
}

export const budgetTotal = (b: Budgets) =>
  CATEGORY_IDS.reduce((t, id) => t + (b[id] && b[id]! > 0 ? b[id]! : 0), 0);

/**
 * A year against the budgets: each budget × the months logged BY CATEGORY
 * (a month logged as one total can't be checked), vs what was spent then.
 */
export function yearBudget(
  entries: MonthEntry[],
  year: number,
  budgets: Budgets,
  annual: AnnualExpense[] = [],
) {
  const months = entries.filter((e) => e.year === year && e.categories);
  if (months.length === 0) return null;
  const spent: Partial<Record<CategoryId, number>> = {};
  for (const e of months) {
    const b = budgetedSpend(e, annual);
    for (const id of CATEGORY_IDS) spent[id] = (spent[id] ?? 0) + (b[id] ?? 0);
  }
  const scaled: Budgets = Object.fromEntries(
    Object.entries(budgets).map(([id, v]) => [id, (v ?? 0) * months.length]),
  );
  return { months: months.length, lines: budgetLines(spent, scaled) };
}
