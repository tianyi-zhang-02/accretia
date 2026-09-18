import { describe, expect, it } from 'vitest';

import { assumptionsSchema } from '@/lib/validation/scenarios';

import { simulate } from '@/lib/simulator/engine';

import { buildFromAnswers } from './guided-setup';

const answers = (o: Partial<Parameters<typeof buildFromAnswers>[0]> = {}) => ({
  age: 30,
  income: 200_000,
  spending: 60_000,
  netWorth: 100_000,
  ...o,
});

describe('guided setup → scenario', () => {
  it('builds a scenario that passes the schema', () => {
    expect(assumptionsSchema.safeParse(buildFromAnswers(answers())).success).toBe(true);
  });

  it('always builds exactly one person (the app is single-person)', () => {
    expect(buildFromAnswers(answers()).people).toHaveLength(1);
    expect(buildFromAnswers(answers({ income: 900_000 })).people).toHaveLength(1);
  });

  it('keeps startingInvested within startingNetWorth (schema invariant)', () => {
    const a = buildFromAnswers(answers({ netWorth: 250_000 }));
    expect(a.startingInvested).toBeLessThanOrEqual(a.startingNetWorth);
  });

  it('scales the tax estimate with household income', () => {
    const low = buildFromAnswers(answers({ income: 80_000 })).effectiveTaxRatePct;
    const high = buildFromAnswers(answers({ income: 900_000 })).effectiveTaxRatePct;
    expect(high).toBeGreaterThan(low);
  });

  it('runs the horizon to age 90 so retirement is visible', () => {
    const a = buildFromAnswers(answers({ age: 40 }));
    expect(a.horizonEndYear - a.horizonStartYear).toBe(50);
  });

  // Without a retire age the generated stage paid a rising salary until the
  // horizon ended at 90 — a 91-year-old still drawing millions, which made
  // the whole projection read as fantasy.
  it('retires everyone at 65 by default, so income actually stops', () => {
    const a = buildFromAnswers(answers());
    expect(a.people.map((p) => p.retireAge)).toEqual([65]);
    const { rows } = simulate(a);
    expect(rows.at(-1)!.grossIncome).toBe(0);
  });

  it('never sets a retire age already in the past', () => {
    const a = buildFromAnswers(answers({ age: 72 }));
    expect(a.people[0]!.retireAge).toBe(73);
    // Still earns for a year, then stops — not an instant-zero-income plan.
    const { rows } = simulate(a);
    expect(rows[0]!.grossIncome).toBeGreaterThan(0);
    expect(rows.at(-1)!.grossIncome).toBe(0);
  });

  // --- untrusted input: a number field accepts more than numbers ---------
  it('squashes Infinity and NaN instead of poisoning the engine', () => {
    const nasty = buildFromAnswers(
      answers({ income: Infinity, spending: NaN, netWorth: -1, age: 1e9 }),
    );
    expect(assumptionsSchema.safeParse(nasty).success).toBe(true);
    expect(Number.isFinite(nasty.people[0]!.careerStages[0]!.baseSalary)).toBe(true);
    expect(nasty.recurringAnnualExpenses).toBe(0);
    expect(nasty.startingNetWorth).toBe(0);
  });

  it('clamps absurd ages into a livable range', () => {
    expect(buildFromAnswers(answers({ age: 999 })).horizonEndYear).toBeGreaterThan(
      buildFromAnswers(answers({ age: 999 })).horizonStartYear,
    );
    const young = buildFromAnswers(answers({ age: 2 }));
    expect(assumptionsSchema.safeParse(young).success).toBe(true);
  });
});
