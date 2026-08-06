/**
 * The insight engine — the "smart" half of the local agent.
 *
 * It answers the question a form can't: *what actually matters in YOUR
 * scenario?* The method is the same one goal-seek uses — **perturb the
 * verified engine and measure** — so every claim is a fact about the model,
 * not a heuristic someone hard-coded:
 *
 *   baseline FIRE age  →  change ONE thing  →  re-simulate  →  Δ years
 *
 * Findings are ranked by that Δ, so the lever that's worth the most to this
 * particular household floats to the top. Some findings carry a `patch` the
 * UI can apply in one click; the reality checks (a savings rate nobody
 * sustains, a return assumption history doesn't support) deliberately don't
 * — there's nothing to "apply", the point is to tell the user the truth.
 *
 * Pure, deterministic, offline. No LLM, no network: the same numbers the
 * chart draws, asked better questions.
 *
 * ---
 * FUTURE: a conversational agent could sit ON TOP of this, not replace it.
 * `buildInsights()` already returns exactly what a model would need as
 * grounding — findings with measured impact and applicable patches — so the
 * seam is: findings in, natural language out. Whatever consumes that seam
 * must keep the privacy promise, which means a model running on the user's
 * own machine (a localhost runtime, or in-browser WASM), never a hosted API.
 * If it can't be done without shipping the user's finances to a third party,
 * it doesn't get built. See CLAUDE.md's hard rule.
 */

import type { Assumptions } from '@/lib/validation/scenarios';

import { simulate } from './engine';
import { computeFire } from './fire';

/**
 * A measured lever: one change, what it's worth, and the patch that makes
 * it real. Generic in the id so `Extract<Insight, {id:'spendLess'}>` stays
 * precise for the UI switch and for tests.
 */
type LeverInsight<Id extends string> = {
  id: Id;
  tone: 'info';
  rank: number;
  /** FIRE age after the change. */
  newAge: number;
  /** Years of FIRE bought by the change (0 when it only makes it reachable). */
  years: number;
  /** True when the baseline never reaches FIRE but this change does. */
  fromNever: boolean;
  patch: Partial<Assumptions>;
};

/** Every finding the engine can produce. Discriminated for a typed UI switch. */
export type Insight =
  /** Headline: the year work becomes optional. */
  | { id: 'fireAge'; tone: 'good'; rank: number; age: number; year: number }
  | { id: 'fireNever'; tone: 'warn'; rank: number }
  /** Levers — each carries a one-click patch and what it's worth in years. */
  | LeverInsight<'spendLess'>
  | LeverInsight<'dropCreep'>
  | LeverInsight<'investMore'>
  /** Reality checks — no patch on purpose; these are honesty, not advice. */
  | { id: 'savingsRateHigh'; tone: 'warn'; rank: number; ratePct: number }
  | { id: 'returnOptimistic'; tone: 'warn'; rank: number; returnPct: number }
  | { id: 'cashDrag'; tone: 'info'; rank: number; sharePct: number }
  | { id: 'crashCost'; tone: 'info'; rank: number; years: number; crashYear: number }
  | { id: 'noRetireAge'; tone: 'info'; rank: number }
  | { id: 'homeExcluded'; tone: 'info'; rank: number };

/**
 * Insight math looks past the user's saved horizon (to age 90) so a lever's
 * value is measurable even when the current horizon ends before FIRE.
 * Never mutates the input.
 */
function toAge90(a: Assumptions): Assumptions {
  const primary = a.people[0];
  if (!primary) return a;
  const end = primary.birthYear + 90;
  return a.horizonEndYear >= end ? a : { ...a, horizonEndYear: end };
}

/** Full-FIRE age under these assumptions, or null if never (by 90). */
function fireAgeFor(a: Assumptions): number | null {
  const primary = a.people[0];
  if (!primary) return null;
  const { rows } = simulate(toAge90(a));
  const fire = computeFire(rows, {
    recurringAnnualExpenses: a.recurringAnnualExpenses,
    safeWithdrawalRatePct: a.fire?.safeWithdrawalRatePct ?? 4,
    annualHealthInsurance: a.fire?.annualHealthInsurance ?? 0,
    essentialAnnualExpenses: a.fire?.essentialAnnualExpenses ?? a.recurringAnnualExpenses,
    returnPct: a.investment.returnPct,
    inflationPct: a.inflationPct,
    primaryBirthYear: primary.birthYear,
  });
  return fire.full.reached ? fire.full.age : null;
}

/** Implied year-1 savings rate (saved ÷ after-tax income), % — an OUTPUT. */
function impliedSavingsRatePct(a: Assumptions): number | null {
  const { rows } = simulate(a);
  const first = rows[0];
  if (!first || first.afterTaxIncome <= 0) return null;
  return (first.saved / first.afterTaxIncome) * 100;
}

export function buildInsights(a: Assumptions): Insight[] {
  const out: Insight[] = [];
  const primary = a.people[0];
  if (!primary) return out;

  const base = fireAgeFor(a);

  // --- Headline -----------------------------------------------------------
  if (base !== null) {
    out.push({ id: 'fireAge', tone: 'good', rank: 1000, age: base, year: primary.birthYear + base });
  } else {
    out.push({ id: 'fireNever', tone: 'warn', rank: 1000 });
  }

  /**
   * Measure one change: what does it buy, in years of FIRE?
   *
   * Ranking note: everything below shares ONE scale so a lever and a
   * reality check can be compared honestly. Levers are worth `20 × years`
   * over a floor of 100, so a 5-year lever ties the savings-rate warning
   * and a 10-year lever beats it — which is the right reading order.
   */
  const lever = (
    id: 'spendLess' | 'dropCreep' | 'investMore',
    patch: Partial<Assumptions>,
  ): void => {
    const newAge = fireAgeFor({ ...a, ...patch });
    if (newAge === null) return; // still unreachable — nothing to claim
    if (base === null) {
      // Turning "never" into a date outranks everything but the headline.
      out.push({ id, tone: 'info', rank: 400, newAge, years: 0, fromNever: true, patch });
      return;
    }
    const years = base - newAge;
    if (years < 1) return; // below a year is noise, not a finding
    out.push({ id, tone: 'info', rank: 100 + years * 20, newAge, years, fromNever: false, patch });
  };

  // --- Levers, each measured against the same baseline ---------------------
  // Spending is usually the biggest one — and the only lever that works on
  // both sides (less spent = more saved AND a smaller FIRE number).
  lever('spendLess', { recurringAnnualExpenses: Math.round(a.recurringAnnualExpenses * 0.9) });

  // Lifestyle creep, if the user turned it on: what is it costing?
  if (
    a.lifestyle &&
    ((a.lifestyle.mode === 'flat' && a.lifestyle.lifestyleCreepPct > 0) ||
      (a.lifestyle.mode === 'incomeScaled' && a.lifestyle.creepShareOfRaisePct > 0))
  ) {
    lever('dropCreep', { lifestyle: { mode: 'flat', lifestyleCreepPct: 0, creepShareOfRaisePct: 0 } });
  }

  // Un-invested surplus earns nothing in this model — is that costing years?
  const share = a.investedSharePct ?? 100;
  if (share < 100) {
    lever('investMore', { investedSharePct: Math.min(100, share + 10) });
  }

  // --- Reality checks (no patch — these are honesty, not buttons) ----------
  const rate = impliedSavingsRatePct(a);
  if (rate !== null && rate > 60) {
    // A rate nobody sustains undermines every date above it — rank it like
    // a 5-year lever.
    out.push({ id: 'savingsRateHigh', tone: 'warn', rank: 200, ratePct: Math.round(rate) });
  }
  if (a.investment.returnPct > 8) {
    out.push({ id: 'returnOptimistic', tone: 'warn', rank: 180, returnPct: a.investment.returnPct });
  }

  const cash = Math.max(0, a.startingNetWorth - a.startingInvested);
  if (a.startingNetWorth > 0 && cash / a.startingNetWorth > 0.25) {
    out.push({
      id: 'cashDrag',
      tone: 'info',
      rank: 80,
      sharePct: Math.round((cash / a.startingNetWorth) * 100),
    });
  }

  // What a 2008-style year five years out would cost, in years of FIRE.
  if (base !== null) {
    const crashYear = a.horizonStartYear + 5;
    const stressed = simulate(toAge90(a), { marketShock: { year: crashYear, returnPct: -37 } });
    const fire = computeFire(stressed.rows, {
      recurringAnnualExpenses: a.recurringAnnualExpenses,
      safeWithdrawalRatePct: a.fire?.safeWithdrawalRatePct ?? 4,
      annualHealthInsurance: a.fire?.annualHealthInsurance ?? 0,
      essentialAnnualExpenses: a.fire?.essentialAnnualExpenses ?? a.recurringAnnualExpenses,
      returnPct: a.investment.returnPct,
      inflationPct: a.inflationPct,
      primaryBirthYear: primary.birthYear,
    });
    const delay = fire.full.reached && fire.full.age !== null ? fire.full.age - base : null;
    if (delay !== null && delay >= 1) {
      out.push({ id: 'crashCost', tone: 'info', rank: 90 + delay * 5, years: delay, crashYear });
    }
  }

  if (a.people.every((p) => p.retireAge === undefined)) {
    out.push({ id: 'noRetireAge', tone: 'info', rank: 60 });
  }
  if (a.mortgage) {
    out.push({ id: 'homeExcluded', tone: 'info', rank: 50 });
  }

  // Headline first, then whatever is worth the most to THIS household.
  return out.sort((x, y) => y.rank - x.rank);
}
