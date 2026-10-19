/**
 * Savings goals — an emergency fund, a down payment, a car. Each has a
 * target, a month to reach it by and what's put aside so far (a balance the
 * person updates; the ledger can't know which dollars are earmarked). From
 * that: what's left, the months left, what each needs a month, and whether
 * all of them together fit in what's actually been kept lately. Stored on
 * the plan (`savingsGoals`); the projection is untouched — goal money is
 * still part of net worth. Pure.
 */

import { recentAverage, type MonthEntry, type YearMonth } from './ledger';

export const GOAL_KINDS = [
  'emergency',
  'downPayment',
  'car',
  'wedding',
  'education',
  'travel',
  'other',
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export type SavingsGoal = {
  kind: GoalKind;
  target: number;
  /** Put aside so far. */
  saved: number;
  /** Reach it by the end of this month. */
  year: number;
  month: number;
};

export const MAX_GOALS = 12;

export type GoalStatus = {
  left: number;
  /** Months from `today` to the deadline month, counting both (0 once it has passed). */
  monthsLeft: number;
  /** What it needs a month from now on; 0 when done; all of `left` when overdue. */
  perMonth: number;
  pct: number;
  done: boolean;
  overdue: boolean;
};

const key = (e: YearMonth) => e.year * 12 + (e.month - 1);
const round = (n: number) => Math.round(n);

export function goalStatus(g: SavingsGoal, today: YearMonth): GoalStatus {
  const left = Math.max(0, g.target - g.saved);
  // No target yet (0) is "not set", not "reached".
  const done = g.target > 0 && left === 0;
  const monthsLeft = Math.max(0, key(g) - key(today) + 1);
  const overdue = !done && monthsLeft === 0;
  return {
    left: round(left),
    monthsLeft,
    perMonth: done ? 0 : round(overdue ? left : left / monthsLeft),
    pct: g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0,
    done,
    overdue,
  };
}

export type GoalsSummary = {
  /** What the open, not-yet-overdue goals need a month, together. */
  needPerMonth: number;
  /** Take-home kept a month lately (last ≤3 logged months), if any were logged. */
  keptPerMonth: number | null;
  /** keptPerMonth − needPerMonth; null without logged months. */
  room: number | null;
};

export function goalsSummary(
  goals: SavingsGoal[],
  entries: MonthEntry[],
  today: YearMonth,
): GoalsSummary {
  const needPerMonth = goals
    .map((g) => goalStatus(g, today))
    .filter((s) => !s.done && !s.overdue)
    .reduce((t, s) => t + s.perMonth, 0);
  // "Lately" includes this month if it's logged.
  const avg = recentAverage(entries, { year: today.year, month: today.month + 1 });
  const keptPerMonth = avg ? round(avg.income - avg.spending) : null;
  return {
    needPerMonth: round(needPerMonth),
    keptPerMonth,
    room: keptPerMonth === null ? null : round(keptPerMonth - needPerMonth),
  };
}

/** A starting point for an emergency fund: six months of recent spending, to the $100. */
export function suggestEmergency(entries: MonthEntry[], today: YearMonth): number | null {
  const avg = recentAverage(entries, { year: today.year, month: today.month + 1 });
  return avg && avg.spending > 0 ? Math.round((avg.spending * 6) / 100) * 100 : null;
}
