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

import { CATEGORY_IDS, tierTotals, type CategoryId, type MonthEntry } from './ledger';

export type LedgerInsight =
  | { id: 'spendingVsUsual'; tone: 'good' | 'warn'; pct: number; amount: number; usual: number }
  | { id: 'categoryJump'; tone: 'warn'; category: CategoryId; amount: number; usual: number }
  | { id: 'categoryDrop'; tone: 'good'; category: CategoryId; amount: number; usual: number }
  | { id: 'savingsRate'; tone: 'good' | 'warn'; ratePct: number; usualPct: number }
  | { id: 'netWorthChange'; tone: 'good' | 'warn'; change: number; months: number }
  | { id: 'yearPace'; tone: 'good' | 'warn'; year: number; projected: number; plan: number }
  | { id: 'splurgeShare'; tone: 'warn'; pct: number; amount: number }
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
): LedgerInsights {
  const sorted = [...entries].sort((a, b) => key(a) - key(b));
  const focus = sorted.at(-1);
  if (!focus) return { focus: null, insights: [] };
  const out: LedgerInsight[] = [];
  if (sorted.length === 1) out.push({ id: 'firstMonth', tone: 'info' });

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
    const kept = inYear.reduce((t, e) => t + e.income - e.spending, 0);
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
  if (focus.netWorth !== undefined) {
    const prev = [...sorted].reverse().find((e) => key(e) < key(focus) && e.netWorth !== undefined);
    if (prev) {
      const change = focus.netWorth - prev.netWorth!;
      out.push({
        id: 'netWorthChange',
        tone: change >= 0 ? 'good' : 'warn',
        change: round(change),
        months: key(focus) - key(prev),
      });
    }
  }

  // ---- splurges ----
  if (focus.categories && focus.spending > 0) {
    const t = tierTotals(focus);
    const pct = (t.splurge / focus.spending) * 100;
    if (pct >= SPLURGE_SHARE && t.splurge >= 200) {
      out.push({ id: 'splurgeShare', tone: 'warn', pct: round(pct), amount: round(t.splurge) });
    }
  }

  // Most informative first. The savings rate mostly restates the spending
  // line, so it ranks below net worth and the year's pace.
  const order: LedgerInsight['id'][] = [
    'firstMonth',
    'spendingVsUsual',
    'categoryJump',
    'netWorthChange',
    'yearPace',
    'savingsRate',
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
