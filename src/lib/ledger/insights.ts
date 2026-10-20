/**
 * What the ledger itself says — the "you" side of "am I on track?".
 *
 * Plain comparisons of a month against the person's OWN recent months (not
 * against national averages or advice): spending vs usual, the category that
 * jumped or fell, savings rate vs usual, net worth since last time, the pace
 * for the year against the plan, and how much went to splurges. Pure and
 * local, like everything in this folder; thresholds are deliberately high so
 * only changes worth a sentence produce one.
 */

import type { YearRow } from '@/lib/simulator/engine';

import { annualIn, dueIn, type AnnualExpense } from './annual';
import { budgetLines, type Budgets } from './budgets';
import { CATEGORY_IDS, tierTotals, type CategoryId, type MonthEntry, hasFlows } from './ledger';

export type LedgerInsight =
  | { id: 'spendingVsUsual'; tone: 'good' | 'warn'; pct: number; amount: number; usual: number }
  | { id: 'categoryJump'; tone: 'warn'; category: CategoryId; amount: number; usual: number }
  | { id: 'categoryDrop'; tone: 'good'; category: CategoryId; amount: number; usual: number }
  | { id: 'savingsRate'; tone: 'good' | 'warn'; ratePct: number; usualPct: number }
  | { id: 'netWorthChange'; tone: 'good' | 'warn'; change: number; months: number }
  | { id: 'yearPace'; tone: 'good' | 'warn'; year: number; projected: number; plan: number }
  | { id: 'splurgeShare'; tone: 'warn'; pct: number; amount: number }
  | { id: 'overBudget'; tone: 'warn'; count: number; category: CategoryId; over: number }
  | { id: 'withinBudget'; tone: 'good'; count: number }
  | { id: 'annualDue'; tone: 'info'; amount: number; count: number }
  | { id: 'vsLastYear'; tone: 'good' | 'warn'; pct: number; amount: number; then: number }
  | { id: 'firstMonth'; tone: 'info' };

export type LedgerInsights = {
  /** The month the findings are about: the latest one logged. */
  focus: { year: number; month: number } | null;
  insights: LedgerInsight[];
};

const key = (e: { year: number; month: number }) => e.year * 12 + (e.month - 1);
const round = (n: number) => Math.round(n);

/** "Usual" = up to three logged months before the focus, within the past year. */
const BASELINE_MONTHS = 3;
const SPENDING_PCT = 10;
const MIN_DOLLARS = 100;
const CATEGORY_PCT = 25;
const RATE_POINTS = 5;
const SPLURGE_SHARE = 15;

export function ledgerInsights(
  entries: MonthEntry[],
  planRows: YearRow[] = [],
  limit = 4,
  budgets: Budgets = {},
  annual: AnnualExpense[] = [],
): LedgerInsights {
  const all = [...entries].sort((a, b) => key(a) - key(b));
  // Money findings come from months with money in them: a month logged with
  // only a net worth would read as "you spent 100% less than usual".
  const sorted = all.filter(hasFlows);
  const focus = sorted.at(-1) ?? all.at(-1);
  if (!focus) return { focus: null, insights: [] };
  const out: LedgerInsight[] = [];
  if (all.length === 1) out.push({ id: 'firstMonth', tone: 'info' });

  const baseline = sorted
    .filter((e) => key(e) < key(focus) && key(focus) - key(e) <= 12)
    .slice(-BASELINE_MONTHS);

  // ---- spending vs usual ----
  if (baseline.length > 0) {
    const usual = baseline.reduce((t, e) => t + e.spending, 0) / baseline.length;
    const diff = focus.spending - usual;
    if (
      usual > 0 &&
      Math.abs(diff) >= MIN_DOLLARS &&
      (Math.abs(diff) / usual) * 100 >= SPENDING_PCT
    ) {
      out.push({
        id: 'spendingVsUsual',
        tone: diff > 0 ? 'warn' : 'good',
        pct: round((diff / usual) * 100),
        amount: focus.spending,
        usual: round(usual),
      });
    }
  }

  // ---- the category that moved most ----
  const catBase = baseline.filter((e) => e.categories);
  if (focus.categories && catBase.length > 0) {
    type Move = { category: CategoryId; amount: number; usual: number; diff: number };
    let up: Move | null = null;
    let down: Move | null = null;
    for (const c of CATEGORY_IDS) {
      const amount = focus.categories[c] ?? 0;
      const usual = catBase.reduce((t, e) => t + (e.categories?.[c] ?? 0), 0) / catBase.length;
      const diff = amount - usual;
      const big =
        Math.abs(diff) >= MIN_DOLLARS &&
        (usual === 0 || (Math.abs(diff) / usual) * 100 >= CATEGORY_PCT);
      if (!big) continue;
      if (diff > 0 && (!up || diff > up.diff))
        up = { category: c, amount, usual: round(usual), diff };
      if (diff < 0 && (!down || diff < down.diff))
        down = { category: c, amount, usual: round(usual), diff };
    }
    if (up)
      out.push({
        id: 'categoryJump',
        tone: 'warn',
        category: up.category,
        amount: up.amount,
        usual: up.usual,
      });
    if (down)
      out.push({
        id: 'categoryDrop',
        tone: 'good',
        category: down.category,
        amount: down.amount,
        usual: down.usual,
      });
  }

  // ---- savings rate vs usual ----
  const incBase = baseline.filter((e) => e.income > 0);
  if (focus.income > 0 && incBase.length > 0) {
    const rate = ((focus.income - focus.spending) / focus.income) * 100;
    const inc = incBase.reduce((t, e) => t + e.income, 0);
    const usualRate = (incBase.reduce((t, e) => t + e.income - e.spending, 0) / inc) * 100;
    if (Math.abs(rate - usualRate) >= RATE_POINTS) {
      out.push({
        id: 'savingsRate',
        tone: rate >= usualRate ? 'good' : 'warn',
        ratePct: round(rate),
        usualPct: round(usualRate),
      });
    }
  }

  // ---- the pace for the year vs the plan ----
  const inYear = sorted.filter((e) => e.year === focus.year);
  const row = planRows.find((r) => r.year === focus.year);
  if (inYear.length >= 2 && row) {
    // Pre-tax savings count: the plan's saving includes them.
    const kept = inYear.reduce((t, e) => t + e.income - e.spending + (e.pretaxSavings ?? 0), 0);
    const projected = (kept / inYear.length) * 12;
    // Same footing as the report: the plan's home costs count as spending.
    const plan = row.saved - (row.housingCosts ?? 0);
    out.push({
      id: 'yearPace',
      tone: projected >= plan ? 'good' : 'warn',
      year: focus.year,
      projected: round(projected),
      plan: round(plan),
    });
  }

  // ---- net worth since the last time it was logged ----
  // Net worth from ANY month — a snapshot-only month is exactly this.
  const nws = all.filter((e) => e.netWorth !== undefined);
  const nwNow = nws.at(-1);
  const nwPrev = nws.at(-2);
  if (nwNow && nwPrev && key(nwNow) >= key(focus)) {
    const change = nwNow.netWorth! - nwPrev.netWorth!;
    out.push({
      id: 'netWorthChange',
      tone: change >= 0 ? 'good' : 'warn',
      change: round(change),
      months: key(nwNow) - key(nwPrev),
    });
  }

  // ---- splurges ----
  if (focus.categories && focus.spending > 0) {
    const t = tierTotals(focus);
    const pct = (t.splurge / focus.spending) * 100;
    if (pct >= SPLURGE_SHARE && t.splurge >= 200) {
      out.push({ id: 'splurgeShare', tone: 'warn', pct: round(pct), amount: round(t.splurge) });
    }
  }

  // ---- once-a-year bills that landed this month ----
  const annualAmount = annualIn(focus, annual);
  if (annualAmount > 0) {
    const count = dueIn(annual, focus.month).filter((x) => focus.breakdown?.[x.item]).length;
    out.push({ id: 'annualDue', tone: 'info', amount: annualAmount, count });
  }

  // ---- the same month last year ----
  const lastYear = sorted.find((e) => e.year === focus.year - 1 && e.month === focus.month);
  if (lastYear && lastYear.spending > 0) {
    const diff = focus.spending - lastYear.spending;
    if (
      Math.abs(diff) >= MIN_DOLLARS &&
      (Math.abs(diff) / lastYear.spending) * 100 >= SPENDING_PCT
    ) {
      out.push({
        id: 'vsLastYear',
        tone: diff > 0 ? 'warn' : 'good',
        pct: round((diff / lastYear.spending) * 100),
        amount: focus.spending,
        then: lastYear.spending,
      });
    }
  }

  // ---- budgets ----
  if (focus.categories) {
    const lines = budgetLines(focus.categories, budgets);
    const over = lines.filter((l) => l.over).sort((a, b) => a.left - b.left);
    if (over.length > 0) {
      out.push({
        id: 'overBudget',
        tone: 'warn',
        count: over.length,
        category: over[0]!.id,
        over: round(-over[0]!.left),
      });
    } else if (lines.length > 0) {
      out.push({ id: 'withinBudget', tone: 'good', count: lines.length });
    }
  }

  // Most informative first. The savings rate mostly restates the spending
  // line, so it ranks below net worth and the year's pace.
  const order: LedgerInsight['id'][] = [
    'overBudget',
    'firstMonth',
    'spendingVsUsual',
    'annualDue',
    'categoryJump',
    'vsLastYear',
    'netWorthChange',
    'yearPace',
    'savingsRate',
    'withinBudget',
    'categoryDrop',
    'splurgeShare',
  ];
  out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { focus: { year: focus.year, month: focus.month }, insights: out.slice(0, limit) };
}

/** One category, month by month, for a year (null = not logged by category). */
export function categoryByMonth(
  entries: MonthEntry[],
  year: number,
  category: CategoryId,
): Array<number | null> {
  return Array.from({ length: 12 }, (_, i) => {
    const e = entries.find((x) => x.year === year && x.month === i + 1);
    return e?.categories ? (e.categories[category] ?? 0) : null;
  });
}
