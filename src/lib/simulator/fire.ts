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
 * Caveat (surfaced in the UI): this treats the whole net worth as investable
 * (true in the current single-pool engine). It's a planning estimate, not
 * advice.
 */

import type { YearRow } from './engine';

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
};

/** First row whose real net worth reaches `target`, as a milestone. */
function firstReaching(
  rows: YearRow[],
  target: number,
  primaryBirthYear: number | null,
): FireMilestone {
  for (const r of rows) {
    if (r.netWorthRealTodayDollars >= target) {
      return {
        reached: true,
        year: r.year,
        age: primaryBirthYear === null ? null : r.year - primaryBirthYear,
        number: target,
      };
    }
  }
  return { reached: false, year: null, age: null, number: target };
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

  const full = firstReaching(rows, fullNumber, opts.primaryBirthYear);
  const lean = firstReaching(rows, leanNumber, opts.primaryBirthYear);

  // Coast FIRE needs an age (to know the years left to compound).
  let coast: FireMilestone = { reached: false, year: null, age: null, number: fullNumber };
  if (opts.primaryBirthYear !== null) {
    const realReturn = (1 + opts.returnPct / 100) / (1 + opts.inflationPct / 100) - 1;
    for (const r of rows) {
      const ageThatYear = r.year - opts.primaryBirthYear;
      const yearsToRetire = retirementAge - ageThatYear;
      // Amount you'd need TODAY so it compounds to the full FIRE number by
      // retirement. Past retirement age, you need the full number outright.
      const needed =
        yearsToRetire > 0 ? fullNumber / Math.pow(1 + realReturn, yearsToRetire) : fullNumber;
      if (r.netWorthRealTodayDollars >= needed) {
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
  };
}
