/**
 * FIRE (financial-independence) helper — a PURE function derived from the
 * projection rows. It does NOT change the engine or re-simulate.
 *
 * Model (all in horizon-start "today's" dollars, matching the engine's
 * `netWorthRealTodayDollars` and the user's expense inputs):
 *
 *   FIRE number = annual spend ÷ (safe-withdrawal-rate / 100)
 *               = 25 × annual spend at a 4% withdrawal rate.
 *
 *   - Full FIRE spend = recurring expenses + health-insurance reserve.
 *   - Lean FIRE spend = essential expenses + health-insurance reserve.
 *   - You "reach FIRE" the first year real net worth ≥ the FIRE number.
 *   - Coast FIRE: the first year your current real net worth, left to
 *     compound at the real return until `retirementAge` (no further saving),
 *     would already reach the Full FIRE number.
 *
 * Basis: INVESTABLE real net worth — invested + cash, i.e. netWorthReal minus
 * home equity. You can't withdraw 4% of a house, so home equity never counts
 * toward a FIRE number. It's a planning estimate, not advice.
 *
 * WITH A HOME (owner's call, 2026-10: "FIRE 目标要算上房屋支出") — the
 * engine pays the home outside `expenses`, so a FIRE number of spend ÷ SWR
 * alone left the house out and read optimistic. From the purchase year, the
 * target in each year is
 *
 *   (spend + property tax + upkeep) ÷ SWR  +  the mortgage still owed
 *
 *   - tax + upkeep are for life: next year's, on the home's value, in the
 *     plan's start-year dollars — so they join the perpetuity;
 *   - the mortgage is a finite debt: enough to pay it off, in real terms;
 *   - a home bought LATER in the plan counts before it's bought too (at its
 *     purchase-year figures) — otherwise FIRE could be declared in a year
 *     the plan is about to buy a house it can't then carry.
 *
 * The home's value and the deflator are rebuilt from the row exactly as the
 * engine built them (value = equity + loan; F = (1+inflation)^(i+1)).
 * Coast FIRE leaves the mortgage out (you are still earning while coasting).
 */

import type { YearRow } from './engine';
import type { Assumptions } from '../validation/scenarios';

export type FireMilestone = {
  reached: boolean;
  /** First year the milestone is met, or null if not within the rows. */
  year: number | null;
  /** Primary person's age that year, or null if there's no person. */
  age: number | null;
  /** The target net-worth number (today's dollars) for this milestone. */
  number: number;
};

export type FireResult = {
  safeWithdrawalRatePct: number;
  retirementAge: number;
  /** Annual spend backing each milestone (today's dollars). */
  fullSpend: number;
  leanSpend: number;
  full: FireMilestone;
  lean: FireMilestone;
  coast: FireMilestone;
  /** The home's part of the full target, in the year it's reached (or now). */
  fullHome: { carrying: number; mortgage: number };
};

export type FireOptions = {
  recurringAnnualExpenses: number;
  safeWithdrawalRatePct: number;
  annualHealthInsurance: number;
  essentialAnnualExpenses: number;
  /** Base nominal return %, for the coast-FIRE real-growth calc. */
  returnPct: number;
  inflationPct: number;
  /** Primary (first) person's birth year, or null if none. */
  primaryBirthYear: number | null;
  /** Traditional retirement age used for Coast FIRE. Default 65. */
  retirementAge?: number;
  /** The plan's first year — needed to rebuild the engine's deflator. */
  horizonStartYear?: number;
  /** The home, if the plan has one: its running costs join the target. */
  home?: { purchaseYear: number; propertyTaxPct: number; maintenancePct: number };
};

/** The FIRE options a plan implies — one place, so every caller agrees. */
export function fireOptionsFor(a: Assumptions): FireOptions {
  return {
    recurringAnnualExpenses: a.recurringAnnualExpenses,
    safeWithdrawalRatePct: a.fire?.safeWithdrawalRatePct ?? 4,
    annualHealthInsurance: a.fire?.annualHealthInsurance ?? 0,
    essentialAnnualExpenses: a.fire?.essentialAnnualExpenses ?? a.recurringAnnualExpenses,
    returnPct: a.investment.returnPct,
    inflationPct: a.inflationPct,
    primaryBirthYear: a.people[0]?.birthYear ?? null,
    horizonStartYear: a.horizonStartYear,
    ...(a.mortgage
      ? {
          home: {
            purchaseYear: a.mortgage.purchaseYear,
            propertyTaxPct: a.mortgage.propertyTaxPct,
            maintenancePct: a.mortgage.maintenancePct ?? 0,
          },
        }
      : {}),
  };
}

/** What the home adds to a year's target, in the plan's start-year dollars. */
export function homeShare(r: YearRow, opts: FireOptions): { carrying: number; mortgage: number } {
  const h = opts.home;
  if (!h || opts.horizonStartYear === undefined || r.year < h.purchaseYear) {
    return { carrying: 0, mortgage: 0 };
  }
  const infl = 1 + opts.inflationPct / 100;
  const F = Math.pow(infl, r.year - opts.horizonStartYear + 1);
  const value = r.homeEquityRealTodayDollars * F + r.mortgageBalance;
  return {
    // Next year's tax + upkeep on today's value, in start-year dollars.
    carrying: (value * (h.propertyTaxPct + h.maintenancePct)) / 100 / (F * infl),
    mortgage: r.mortgageBalance / F,
  };
}

/** Investable (ex-home) real net worth — the basis for every FIRE milestone. */
function investableReal(r: YearRow): number {
  return r.netWorthRealTodayDollars - r.homeEquityRealTodayDollars;
}

/**
 * First row whose investable real net worth reaches its year's target. Not
 * reached: `number` is the target in the first row (where you are now).
 */
function firstReaching(
  rows: YearRow[],
  target: (r: YearRow) => number,
  primaryBirthYear: number | null,
  fallback: number,
): FireMilestone {
  for (const r of rows) {
    const t = target(r);
    if (investableReal(r) >= t) {
      return {
        reached: true,
        year: r.year,
        age: primaryBirthYear === null ? null : r.year - primaryBirthYear,
        number: t,
      };
    }
  }
  return {
    reached: false,
    year: null,
    age: null,
    number: rows[0] ? target(rows[0]) : fallback,
  };
}

export function computeFire(rows: YearRow[], opts: FireOptions): FireResult {
  const retirementAge = opts.retirementAge ?? 65;
  const swr = opts.safeWithdrawalRatePct / 100;

  const fullSpend = opts.recurringAnnualExpenses + opts.annualHealthInsurance;
  const leanSpend = opts.essentialAnnualExpenses + opts.annualHealthInsurance;

  // Guard: a non-positive rate would divide by ~0. min() in the schema keeps
  // it ≥ 0.5%, but be defensive for direct/test callers.
  const safeSwr = swr > 0 ? swr : 0.04;
  const fullNumber = fullSpend / safeSwr;
  const leanNumber = leanSpend / safeSwr;

  // Before a purchase later in the plan, the coming home's figures apply.
  const firstOwned = opts.home ? rows.find((r) => r.year >= opts.home!.purchaseYear) : undefined;
  const homeFor = (r: YearRow) =>
    homeShare(firstOwned && r.year < firstOwned.year ? firstOwned : r, opts);
  const target = (spendNumber: number) => (r: YearRow) => {
    const h = homeFor(r);
    return spendNumber + h.carrying / safeSwr + h.mortgage;
  };
  const full = firstReaching(rows, target(fullNumber), opts.primaryBirthYear, fullNumber);
  const lean = firstReaching(rows, target(leanNumber), opts.primaryBirthYear, leanNumber);

  // Coast FIRE needs an age (to know the years left to compound).
  let coast: FireMilestone = { reached: false, year: null, age: null, number: full.number };
  if (opts.primaryBirthYear !== null) {
    const realReturn = (1 + opts.returnPct / 100) / (1 + opts.inflationPct / 100) - 1;
    for (const r of rows) {
      const ageThatYear = r.year - opts.primaryBirthYear;
      const yearsToRetire = retirementAge - ageThatYear;
      // Amount you'd need TODAY so it compounds to the full FIRE number by
      // retirement. Past retirement age, you need the full number outright.
      // The home's running costs are for life; the mortgage is left out
      // (while coasting you still earn, and pay it from that).
      const goal = fullNumber + homeFor(r).carrying / safeSwr;
      const needed = yearsToRetire > 0 ? goal / Math.pow(1 + realReturn, yearsToRetire) : goal;
      if (investableReal(r) >= needed) {
        coast = { reached: true, year: r.year, age: ageThatYear, number: needed };
        break;
      }
    }
  }

  return {
    safeWithdrawalRatePct: opts.safeWithdrawalRatePct,
    retirementAge,
    fullSpend,
    leanSpend,
    full,
    lean,
    coast,
    fullHome: (() => {
      const at = rows.find((r) => r.year === full.year) ?? rows[0];
      return at ? homeFor(at) : { carrying: 0, mortgage: 0 };
    })(),
  };
}
