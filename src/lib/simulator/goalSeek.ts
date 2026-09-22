import type { Assumptions } from '@/lib/validation/scenarios';

import { simulate } from './engine';

/**
 * Goal-seek solver: given a target net worth at a target age, compute what
 * each of four levers would have to be — on its own, holding everything
 * else fixed — to close the gap.
 *
 * Methodology choice (intentional):
 *   Each lever is solved by *bisection over the existing engine*, NOT by
 *   deriving a closed-form formula. Closed forms introduce a new math
 *   surface that has to be re-verified; bisection just reuses the engine
 *   the user has already signed off on. That's the correctness guarantee
 *   — if the engine is right, the solver is right by construction.
 *
 * What this is and isn't:
 *   This is a planning illustration. The output is "if you changed lever X
 *   to Y, the engine projects you'd hit the target" — a conditional
 *   describing the model's behavior, not financial advice. The UI must
 *   surface that framing; the solver returns numbers, not instructions.
 *
 * Levers (each independently held in `LeverResults`):
 *   - extraMonthlyContribution: $/mo of additional savings on top of the
 *     scenario's existing savings-rate calculation.
 *   - returnPct: the base nominal return assumption.
 *   - annualExpenses: recurring household expenses baseline.
 *   - targetAge: the age by which the target is hit (lever varies the age
 *     itself, holding the dollar amount fixed).
 *   - oneTimeWindfall: a single liquidity event (equity exit, business
 *     sale, inheritance) landing in the FIRST horizon year — i.e. the
 *     minimum possible check, since earlier money compounds longest. This
 *     is the lever that answers targets no savings rate can reach
 *     (a $100M goal is an exit-sized number, not a budgeting question).
 *
 * Search bounds were picked to be wide enough to capture realistic answers
 * without exploding to absurd numbers. If a lever can't close the gap
 * inside its bound, the solver reports {ok: false} with a human-readable
 * reason; the UI shows "not reachable by X alone" instead of a misleading
 * boundary value.
 */

export type SolveOk = {
  ok: true;
  /** The lever's required value after solving (e.g. 8.8 for 8.8% return). */
  value: number;
  /** How far the lever has to move from its current setting. Same units as `value`. */
  delta: number;
};

export type SolveFail = {
  ok: false;
  /** Short human-readable reason; suitable for the UI to display verbatim. */
  reason: string;
};

export type SolveResult = SolveOk | SolveFail;

export type GoalSeekResult =
  | {
      kind: 'no-target';
    }
  | {
      kind: 'no-people';
    }
  | {
      kind: 'on-track';
      projected: number;
      target: number;
      /** projected - target, always ≥ 0 in this branch. */
      surplus: number;
      targetAge: number;
    }
  | {
      kind: 'short';
      projected: number;
      target: number;
      /** target - projected, always > 0 in this branch. */
      gap: number;
      targetAge: number;
      levers: {
        extraMonthlyContribution: SolveResult;
        returnPct: SolveResult;
        annualExpenses: SolveResult;
        targetAge: SolveResult;
        oneTimeWindfall: SolveResult;
      };
    };

/**
 * Net worth at the primary person's target age, extending the horizon
 * internally if the user's saved horizon doesn't reach that far.
 * Pure — does not mutate `a`.
 *
 * Special cases:
 *   - No people in the scenario: returns NaN (caller must guard).
 *   - Target age earlier than horizon start: returns the scenario's
 *     starting net worth (we never simulated before the horizon).
 *   - Target age exactly at horizon start: the engine's first row is the
 *     end of horizonStartYear, so person[0].birthYear + age = horizonStartYear
 *     resolves to row 0.
 */
export function netWorthAtAge(a: Assumptions, age: number): number {
  if (a.people.length === 0) return NaN;
  const primary = a.people[0]!;
  // Bisection over the age lever passes fractional ages (e.g. 51.5) but the
  // engine produces one row per integer year. To keep this function
  // continuous — so bisection converges to a meaningful fractional age
  // ("you'd hit the target 1.7 years later") rather than snapping to the
  // next integer year — we linearly interpolate net worth between the
  // floor and ceil years bracketing the exact target.
  const exactYear = primary.birthYear + age;
  if (exactYear <= a.horizonStartYear - 1) return a.startingNetWorth;

  const floorYear = Math.floor(exactYear);
  const ceilYear = Math.ceil(exactYear);
  const frac = exactYear - floorYear; // 0 when exact, in [0,1) otherwise

  // Internally extend the horizon to cover ceilYear without mutating `a`.
  const horizonEndYear = Math.max(a.horizonEndYear, ceilYear);
  const stretched: Assumptions = a.horizonEndYear === horizonEndYear ? a : { ...a, horizonEndYear };
  const { rows } = simulate(stretched);

  const floorRow = rows.find((r) => r.year === floorYear);
  const ceilRow = rows.find((r) => r.year === ceilYear);

  // floorYear sits one year before horizonStartYear → treat that endpoint
  // as the starting net worth (no row was simulated for it).
  const floorValue = floorRow
    ? floorRow.netWorth
    : floorYear < a.horizonStartYear
      ? a.startingNetWorth
      : NaN;
  const ceilValue = ceilRow ? ceilRow.netWorth : NaN;

  if (!Number.isFinite(floorValue) && !Number.isFinite(ceilValue)) return NaN;
  if (!Number.isFinite(floorValue)) return ceilValue;
  if (!Number.isFinite(ceilValue)) return floorValue;

  return floorValue * (1 - frac) + ceilValue * frac;
}

/**
 * Generic monotonic bisection. `evaluate` should produce a strictly
 * monotonic value over `[lo, hi]`. `increasing=true` means evaluate goes
 * UP as the lever goes up (savings, return, age); `increasing=false`
 * means evaluate goes DOWN as the lever goes up (spending).
 *
 * Termination: stops when |evaluate(mid) - target| < tolerance, or when
 * the search interval shrinks below `valueTolerance` (e.g. $1 of savings,
 * 0.01% return), or after `maxIter` iterations. The fallback midpoint is
 * returned in any case where the bracket is valid — the only way to get
 * {ok:false} out of this function is unreachability at the bounds.
 */
function bisect(args: {
  lo: number;
  hi: number;
  target: number;
  evaluate: (v: number) => number;
  increasing: boolean;
  tolerance?: number;
  valueTolerance?: number;
  maxIter?: number;
}): SolveResult {
  const {
    target,
    evaluate,
    increasing,
    tolerance = 1_000,
    valueTolerance = 1e-4,
    maxIter = 40,
  } = args;
  let { lo, hi } = args;
  const fLo = evaluate(lo);
  const fHi = evaluate(hi);

  // Bracket check. If the lever can't reach the target between its bounds,
  // bail out with a clear reason.
  if (increasing) {
    if (fHi < target) {
      return { ok: false, reason: "not reachable within the lever's upper bound" };
    }
    if (fLo > target) {
      // Already exceeds at the LOW end — this lever isn't the constraint.
      // Surface honestly rather than returning a misleading boundary value.
      return { ok: false, reason: 'no change needed — already exceeds target at the lower bound' };
    }
  } else {
    if (fLo < target) {
      return { ok: false, reason: "not reachable — even at the lever's most aggressive value" };
    }
    if (fHi > target) {
      return { ok: false, reason: 'no change needed — already exceeds target at the upper bound' };
    }
  }

  for (let iter = 0; iter < maxIter; iter += 1) {
    const mid = (lo + hi) / 2;
    const fMid = evaluate(mid);
    if (Math.abs(fMid - target) < tolerance) {
      return { ok: true, value: mid, delta: 0 }; // caller fills in delta
    }
    const goHigh = increasing ? fMid < target : fMid > target;
    if (goHigh) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < valueTolerance) break;
  }
  return { ok: true, value: (lo + hi) / 2, delta: 0 };
}

/**
 * Top-level entry point. Reads `a.target` and returns a structured
 * `GoalSeekResult` describing where the user stands relative to the
 * target and (when short) what each lever would need to be.
 *
 * Does NOT mutate `a`. Levers are computed independently — each holds all
 * other assumptions fixed and only varies its own one variable.
 */
export function solveGoalSeek(a: Assumptions): GoalSeekResult {
  if (!a.target) return { kind: 'no-target' };
  if (a.people.length === 0) return { kind: 'no-people' };

  const targetAmount = a.target.amount;
  const targetAge = a.target.age;
  const projected = netWorthAtAge(a, targetAge);

  if (!Number.isFinite(projected)) {
    // Defensive — target age fell outside the horizon and no row was found.
    // Treat as a 0 projection so the UI still has something to render.
    return {
      kind: 'short',
      projected: 0,
      target: targetAmount,
      gap: targetAmount,
      targetAge,
      levers: {
        extraMonthlyContribution: { ok: false, reason: 'projection unavailable' },
        returnPct: { ok: false, reason: 'projection unavailable' },
        annualExpenses: { ok: false, reason: 'projection unavailable' },
        targetAge: { ok: false, reason: 'projection unavailable' },
        oneTimeWindfall: { ok: false, reason: 'projection unavailable' },
      },
    };
  }

  if (projected >= targetAmount) {
    return {
      kind: 'on-track',
      projected,
      target: targetAmount,
      surplus: projected - targetAmount,
      targetAge,
    };
  }

  const currentSavings = a.extraAnnualContribution ?? 0;
  const currentReturn = a.investment.returnPct;
  const currentExpenses = a.recurringAnnualExpenses;

  // Lever 1: extra savings (annual, then converted to monthly for display).
  // Bound at $600k/yr (= $50k/mo) — high enough to capture any realistic
  // answer, low enough that the bisection doesn't waste iterations.
  const savingsLever = bisect({
    lo: currentSavings,
    hi: Math.max(currentSavings, 600_000),
    target: targetAmount,
    increasing: true,
    evaluate: (v) => netWorthAtAge({ ...a, extraAnnualContribution: v }, targetAge),
  });

  // Lever 2: base return %. Note: shifts only the base returnPct. The
  // low/high band variants stay where the user set them; for the solve we
  // care about the central projection only.
  const returnLever = bisect({
    lo: currentReturn,
    hi: 30,
    target: targetAmount,
    increasing: true,
    valueTolerance: 1e-3,
    evaluate: (v) =>
      netWorthAtAge({ ...a, investment: { ...a.investment, returnPct: v } }, targetAge),
  });

  // Lever 3: recurring expenses. Decreasing: less spending → more saved →
  // more wealth at target age. Bracket [0, current].
  const expensesLever = bisect({
    lo: 0,
    hi: currentExpenses,
    target: targetAmount,
    increasing: false,
    evaluate: (v) => netWorthAtAge({ ...a, recurringAnnualExpenses: v }, targetAge),
  });

  // Lever 4: push the target age out. Bounded at 100 (anyone older than
  // that is past the design horizon of this tool).
  const ageLever = bisect({
    lo: targetAge,
    hi: 100,
    target: targetAmount,
    increasing: true,
    valueTolerance: 1e-3,
    evaluate: (v) => netWorthAtAge(a, v),
  });

  // Lever 5: a one-time liquidity event (exit / sale / inheritance) landing
  // in the first horizon year — the earliest possible, so this is the
  // MINIMUM check size; a later event would have to be bigger. Bounded at
  // the schema's money cap. This is the lever that still has an answer when
  // the target is beyond any savings rate (e.g. $100M).
  const windfallYear = a.horizonStartYear;
  const windfallLever = bisect({
    lo: 0,
    hi: 1e12,
    target: targetAmount,
    tolerance: Math.max(1_000, targetAmount * 1e-6),
    evaluate: (v) =>
      netWorthAtAge(
        {
          ...a,
          windfalls: [...a.windfalls, { label: 'goal-seek exit', year: windfallYear, amount: v }],
        },
        targetAge,
      ),
    increasing: true,
  });

  // Fill in deltas (each lever's required value minus its current value).
  function withDelta(r: SolveResult, current: number): SolveResult {
    if (!r.ok) return r;
    return { ok: true, value: r.value, delta: r.value - current };
  }

  return {
    kind: 'short',
    projected,
    target: targetAmount,
    gap: targetAmount - projected,
    targetAge,
    levers: {
      extraMonthlyContribution: withDelta(savingsLever, currentSavings),
      returnPct: withDelta(returnLever, currentReturn),
      annualExpenses: withDelta(expensesLever, currentExpenses),
      targetAge: withDelta(ageLever, targetAge),
      // A one-time event has no "current setting" — delta = the full check.
      oneTimeWindfall: withDelta(windfallLever, 0),
    },
  };
}
