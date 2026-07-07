import type { Assumptions } from '@/lib/validation/scenarios';

/**
 * A reasonable starting point for a new scenario. Editorially neutral —
 * the user should override everything before relying on the projection.
 */
export function defaultAssumptions(): Assumptions {
  const thisYear = new Date().getFullYear();
  return {
    horizonStartYear: thisYear,
    horizonEndYear: thisYear + 30,
    // Seed with one earner so the default projection is illustrative rather
    // than an all-drawdown line. Everything here is meant to be overwritten.
    people: [
      {
        id: newId(),
        name: 'You',
        birthYear: thisYear - 28,
        careerStages: [
          {
            label: 'Software engineer',
            startAge: 22,
            baseSalary: 160_000,
            annualRaisePct: 3,
            bonusPct: 15,
            annualEquity: 80_000,
          },
        ],
      },
    ],
    startingNetWorth: 50_000,
    startingInvested: 50_000,
    effectiveTaxRatePct: 32,
    // Conservative default returns (nominal). 6% ≈ ~3% real at 3% inflation —
    // deliberately on the cautious side so the projection doesn't over-promise.
    investment: { returnPct: 6, returnPctLow: 3, returnPctHigh: 9 },
    inflationPct: 3,
    windfalls: [],
    majorExpenses: [],
    recurringAnnualExpenses: 60_000,
  };
}

export function newId(): string {
  // crypto.randomUUID is supported in modern browsers + Node 19+.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
