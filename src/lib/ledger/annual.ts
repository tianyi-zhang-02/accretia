/**
 * Bills that come once a year — car insurance, property tax, tuition, the
 * summer trip. Each is a payment of a fixed line item in a given month
 * (property tax paid twice a year is two payments). They live on the plan
 * (`annualExpenses`), like budgets, and never change the projection: the
 * plan's yearly spending already includes them. What they add is foresight —
 * what to put aside each month, what's coming up, and why a month was big.
 */

import { shiftMonth, type MonthEntry, type SubId, type YearMonth } from './ledger';

export type AnnualExpense = { item: SubId; amount: number; month: number };

export const MAX_ANNUAL = 24;

/** The usual suspects, offered as one-tap starting points. */
export const ANNUAL_SUGGESTIONS: SubId[] = [
  'insurance.auto',
  'insurance.home',
  'housing.propertyTax',
  'family.tuition',
  'fun.travel',
  'fun.gifts',
  'fun.subscriptions',
  'other.taxes',
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export const annualTotal = (list: AnnualExpense[]) =>
  round2(list.reduce((t, x) => t + (x.amount > 0 ? x.amount : 0), 0));

/** Put this aside every month and each payment is covered when it lands. */
export const monthlyReserve = (list: AnnualExpense[]) => round2(annualTotal(list) / 12);

/** Payments due in a calendar month (1–12). */
export const dueIn = (list: AnnualExpense[], month: number) =>
  list.filter((x) => x.month === month && x.amount > 0);

/** Due payments merged per line item — what a check-in would fill in. */
export function dueItems(list: AnnualExpense[], month: number): Partial<Record<SubId, number>> {
  const out: Partial<Record<SubId, number>> = {};
  for (const x of dueIn(list, month)) out[x.item] = round2((out[x.item] ?? 0) + x.amount);
  return out;
}

export type Upcoming = AnnualExpense & YearMonth & { monthsAway: number };

/** The next `n` payments from `today` on (this month counts as 0 away). */
export function upcoming(list: AnnualExpense[], today: YearMonth, n = 3): Upcoming[] {
  return list
    .filter((x) => x.amount > 0)
    .map((x) => {
      const monthsAway = (x.month - today.month + 12) % 12;
      return { ...x, ...shiftMonth(today, monthsAway), monthsAway };
    })
    .sort((a, b) => a.monthsAway - b.monthsAway || b.amount - a.amount)
    .slice(0, n);
}

/**
 * Of a logged month's spending, how much went to annual payments due that
 * month — counted only where that line item was logged.
 */
export function annualIn(e: MonthEntry, list: AnnualExpense[]): number {
  const due = dueItems(list, e.month);
  return round2((Object.keys(due) as SubId[]).reduce((t, id) => t + (e.breakdown?.[id] ?? 0), 0));
}
