/**
 * Monte-Carlo layer — a PURE, additive wrapper around the deterministic
 * engine. It does NOT change `simulate()` or the core math: it just runs the
 * same per-year cash-flow logic many times, each year drawing a random return
 * from a normal distribution centred on your base return with a given
 * volatility — plus, for career stages that declare `volatilityPct`
 * (unpredictable pay: partner draws, commission), a per-year comp draw —
 * then aggregates the runs into p10 / p50 / p90 bands.
 *
 * Seeded (fixed PRNG) so the same assumptions always produce the same bands —
 * no flicker on re-render. With `volatilityPct = 0` every run is identical and
 * the bands collapse onto the deterministic projection (regression-tested).
 *
 * All values are real (today's-dollar) net worth, matching the rest of the UI.
 */

import type { Assumptions } from '@/lib/validation/scenarios';

import { simulateScenario } from './engine';

export type MonteCarloResult = {
  years: number[];
  /** Real (today's-dollar) net worth percentiles, one entry per year. */
  p10: number[];
  p50: number[];
  p90: number[];
  runs: number;
  /**
   * P(real net worth ≥ the goal-seek target at the target year), 0..1 —
   * null when there's no target or it falls outside the horizon.
   */
  successProbability: number | null;
};

/** Deterministic PRNG (mulberry32) — reproducible bands across renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller, driven by the seeded uniform rng. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx]!;
}

export function runMonteCarlo(
  a: Assumptions,
  opts: { volatilityPct: number; runs?: number; seed?: number },
): MonteCarloResult {
  const runs = opts.runs ?? 1000;
  const mean = a.investment.returnPct;
  const sd = Math.max(0, opts.volatilityPct);
  const rng = mulberry32(opts.seed ?? 0x9e3779b9);

  const byYear: number[][] = [];
  let years: number[] = [];

  for (let r = 0; r < runs; r += 1) {
    // iid annual return draw, clamped to a sane band (no −100%+ wipeouts).
    const sample = () => Math.max(-90, Math.min(100, mean + sd * gaussian(rng)));
    // Unpredictable pay (career stages with volatilityPct): a multiplicative
    // comp factor, floored at 0 (a bad year pays little, never negative).
    // Only invoked for volatile stages, so scenarios without any leave the
    // rng sequence — and therefore the existing bands — untouched.
    const sampleIncome = (_i: number, volPct: number) =>
      Math.max(0, 1 + (volPct / 100) * gaussian(rng));
    const rows = simulateScenario(a, mean, undefined, sample, sampleIncome);
    if (r === 0) years = rows.map((row) => row.year);
    rows.forEach((row, i) => {
      (byYear[i] ??= []).push(row.netWorthRealTodayDollars);
    });
  }

  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  for (const col of byYear) {
    col.sort((x, y) => x - y);
    p10.push(percentile(col, 0.1));
    p50.push(percentile(col, 0.5));
    p90.push(percentile(col, 0.9));
  }

  let successProbability: number | null = null;
  const target = a.target;
  const primary = a.people[0];
  if (target && primary) {
    const targetYear = primary.birthYear + target.age;
    const idx = years.indexOf(targetYear);
    if (idx >= 0) {
      const col = byYear[idx]!;
      successProbability = col.filter((v) => v >= target.amount).length / col.length;
    }
  }

  return { years, p10, p50, p90, runs, successProbability };
}
