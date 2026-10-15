import {
  monthEntrySchema,
  remove,
  tierTotals,
  totalSaved,
  upsert,
  type Breakdown,
  type Categories,
  type IncomeSources,
  type MonthEntry,
} from '@/lib/ledger/ledger';

import type { VaultData } from './vault';

/**
 * What the assistant may change about ONE month. Every field is optional:
 * by default only what's given changes ("merge"). Totals are never typed
 * when their parts are given — the ledger derives them (see ledger.ts).
 */
export type MonthEdit = {
  year: number;
  month: number;
  /** Take-home for the month, as one number. Clears any income sources. */
  income?: number;
  /** Take-home by source; merged into what's there. 0 removes a source. */
  incomeSources?: IncomeSources;
  /** Spending as one number. Clears any categories / line items. */
  spending?: number;
  /** Spending by category; merged. 0 removes a category. */
  categories?: Categories;
  /** Spending by line item ("housing.rent"); merged. 0 removes an item. */
  lineItems?: Breakdown;
  /** Month-end net worth; null removes it. */
  netWorth?: number | null;
  /** 401(k) / HSA etc. taken before take-home; 0 removes it. */
  pretaxSavings?: number;
  /** Start from an empty month instead of merging. */
  replace?: boolean;
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The edited month, validated and normalized exactly like the web app does. */
export function applyMonthEdit(existing: MonthEntry | undefined, e: MonthEdit): MonthEntry {
  const base: Record<string, unknown> =
    e.replace || !existing
      ? { year: e.year, month: e.month, income: 0, spending: 0 }
      : clone(existing);

  if (e.incomeSources) {
    base.incomeSources = { ...((base.incomeSources as IncomeSources) ?? {}), ...e.incomeSources };
  } else if (e.income !== undefined) {
    base.income = e.income;
    delete base.incomeSources;
  }

  if (e.categories || e.lineItems) {
    base.categories = { ...((base.categories as Categories) ?? {}), ...(e.categories ?? {}) };
    base.breakdown = { ...((base.breakdown as Breakdown) ?? {}), ...(e.lineItems ?? {}) };
  } else if (e.spending !== undefined) {
    base.spending = e.spending;
    delete base.categories;
    delete base.breakdown;
  }

  if (e.netWorth === null) delete base.netWorth;
  else if (e.netWorth !== undefined) base.netWorth = e.netWorth;

  if (e.pretaxSavings !== undefined) base.pretaxSavings = e.pretaxSavings;

  return monthEntrySchema.parse(base);
}

export function findMonth(d: VaultData, year: number, month: number): MonthEntry | undefined {
  return d.ledger.find((x) => x.year === year && x.month === month);
}

/** A pure change for Vault.update: upsert one edited month. */
export function logMonthChange(e: MonthEdit) {
  return (d: VaultData): VaultData => ({
    ...d,
    ledger: upsert(d.ledger, applyMonthEdit(findMonth(d, e.year, e.month), e)),
  });
}

export function clearMonthChange(year: number, month: number) {
  return (d: VaultData): VaultData => ({ ...d, ledger: remove(d.ledger, year, month) });
}

/** The answer a person wants after logging: what was kept, and how it splits. */
export function monthSummary(e: MonthEntry) {
  const s = totalSaved([e]);
  const t = tierTotals(e);
  return {
    takeHome: e.income,
    spending: e.spending,
    kept: s.kept,
    pretaxSavings: s.pretax,
    totalSaved: s.total,
    savingsRatePct: s.savingsRatePct === null ? null : Math.round(s.savingsRatePct * 10) / 10,
    byKind: e.categories
      ? { essentials: t.needs, lifestyle: t.lifestyle, splurges: t.splurge }
      : null,
  };
}
