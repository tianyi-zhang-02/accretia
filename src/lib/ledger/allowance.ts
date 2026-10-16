/**
 * "To stay on plan, what's left for everyday spending this month?" — the
 * plan's monthly spending, less the bills that repeat every month and less
 * the monthly share of once-a-year bills. Joins the projection (what the
 * plan allows) to the ledger (what's already spoken for). Pure; it reads
 * the plan, changes nothing.
 */

import type { YearRow } from '@/lib/simulator/engine';

import { annualIn, monthlyReserve, type AnnualExpense } from './annual';
import { planAt, recurringFor, type MonthEntry, type YearMonth } from './ledger';

export type Allowance = {
  /** What the plan expects to be spent a month (home costs included). */
  plan: number;
  /** Spending that repeated exactly in the last two months (rent, insurance…). */
  fixed: number;
  /** One twelfth of the once-a-year bills. */
  annualReserve: number;
  /** plan − fixed − annualReserve. Negative: the fixed costs alone exceed the plan. */
  flexible: number;
  /**
   * What everyday spending has actually been: the last (up to) three logged
   * months, less the repeating bills and less any annual bill that landed.
   */
  usualFlexible: number | null;
};

const key = (e: YearMonth) => e.year * 12 + (e.month - 1);
const round = (n: number) => Math.round(n);

export function monthAllowance(
  entries: MonthEntry[],
  ym: YearMonth,
  planRows: YearRow[],
  startingNetWorth: number,
  annual: AnnualExpense[] = [],
): Allowance | null {
  const p = planAt(planRows, startingNetWorth, ym);
  if (!p) return null;
  const r = recurringFor(entries, ym);
  const fixed =
    Object.values(r.lineItems).reduce((t, v) => t + (v ?? 0), 0) +
    Object.values(r.categories).reduce((t, v) => t + (v ?? 0), 0);
  const annualReserve = monthlyReserve(annual);
  const prior = [...entries]
    .filter((e) => key(e) < key(ym))
    .sort((a, b) => key(a) - key(b))
    .slice(-3);
  const usualFlexible = prior.length
    ? round(prior.reduce((t, e) => t + e.spending - fixed - annualIn(e, annual), 0) / prior.length)
    : null;
  return {
    plan: round(p.monthlySpending),
    fixed: round(fixed),
    annualReserve: round(annualReserve),
    flexible: round(p.monthlySpending - fixed - annualReserve),
    usualFlexible,
  };
}
