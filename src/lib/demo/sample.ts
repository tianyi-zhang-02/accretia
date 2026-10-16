/**
 * Sample data for "Try it with sample data" — one believable household so a
 * first-time visitor can see every part of the app before typing anything.
 * Deterministic (seeded) and dated relative to `today`, so it always ends
 * last month and looks current. Lives only in memory: the app never saves it.
 */

import type { AnnualExpense } from '@/lib/ledger/annual';
import type { Budgets } from '@/lib/ledger/budgets';
import type { SavingsGoal } from '@/lib/ledger/goals';
import {
  ledgerSchema,
  shiftMonth,
  type Breakdown,
  type MonthEntry,
  type YearMonth,
} from '@/lib/ledger/ledger';
import { assumptionsSchema, type Assumptions } from '@/lib/validation/scenarios';

export const SAMPLE_MONTHS = 20;

/** mulberry32 — a tiny seeded PRNG, so the sample is the same every time. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Sample = {
  assumptions: Assumptions;
  ledger: MonthEntry[];
};

export function sampleData(today: YearMonth, name: string): Sample {
  const r = rng(20260704);
  const between = (lo: number, hi: number, step = 10) =>
    Math.round((lo + r() * (hi - lo)) / step) * step;

  const first = shiftMonth(today, -SAMPLE_MONTHS);
  const ledger: MonthEntry[] = [];
  let netWorth = 98_000;
  for (let i = 0; i < SAMPLE_MONTHS; i += 1) {
    const ym = shiftMonth(first, i);
    const m = ym.month;
    const rent = i < 12 ? 3_100 : 3_200;
    const breakdown: Breakdown = {
      'housing.rent': rent,
      'utilities.energy': m >= 6 && m <= 9 ? between(120, 160) : between(70, 110),
      'utilities.internet': 70,
      'utilities.phone': 45,
      'food.groceries': between(520, 700),
      'food.dining': between(240, 460),
      'food.coffee': between(40, 80, 5),
      'transport.transit': 127,
      'transport.rideshare': between(30, 130),
      'insurance.other': 18,
      'health.fitness': 89,
      'fun.subscriptions': 42,
      'fun.shopping': between(120, 420),
      'other.personalCare': between(40, 90),
    };
    if (m === 7) breakdown['fun.travel'] = 2_600;
    else if (m === 12) breakdown['fun.travel'] = 900;
    if (m === 12) breakdown['fun.gifts'] = 450;
    const incomeSources = {
      salary: 9_350,
      interest: between(110, 170, 5),
      ...(m === 3 ? { bonus: 8_200 } : {}),
    };
    const income = Object.values(incomeSources).reduce((t, v) => t + v, 0);
    const spending = Object.values(breakdown).reduce((t, v) => t + (v ?? 0), 0);
    // What was kept, the 401(k), and a market that mostly goes up.
    netWorth += income - spending + 1_958 + Math.round((r() - 0.3) * 0.02 * netWorth);
    ledger.push({
      year: ym.year,
      month: ym.month,
      income,
      spending,
      incomeSources,
      breakdown,
      pretaxSavings: 1_958,
      netWorth: Math.round(netWorth / 100) * 100,
    });
  }

  const monthlyBudgets: Budgets = { food: 1_100, fun: 750, transport: 250 };
  const annualExpenses: AnnualExpense[] = [
    { item: 'fun.travel', amount: 2_600, month: 7 },
    { item: 'fun.gifts', amount: 450, month: 12 },
  ];
  const by = (months: number) => shiftMonth(today, months);
  const savingsGoals: SavingsGoal[] = [
    { kind: 'emergency', target: 30_000, saved: 21_500, ...by(10) },
    { kind: 'downPayment', target: 120_000, saved: 46_000, ...by(30) },
  ];

  const year = today.year;
  const assumptions = assumptionsSchema.parse({
    horizonStartYear: year,
    horizonEndYear: year + 30,
    people: [
      {
        id: 'sample-person',
        name,
        birthYear: year - 31,
        careerStages: [
          {
            label: 'Software engineer',
            startAge: 24,
            baseSalary: 175_000,
            annualRaisePct: 3,
            bonusPct: 12,
            annualEquity: 40_000,
          },
        ],
      },
    ],
    startingNetWorth: ledger.at(-1)!.netWorth,
    startingInvested: Math.round(ledger.at(-1)!.netWorth! * 0.8),
    investedSharePct: 80,
    effectiveTaxRatePct: 30,
    investment: { returnPct: 6, returnPctLow: 3, returnPctHigh: 9 },
    inflationPct: 3,
    windfalls: [],
    majorExpenses: [],
    recurringAnnualExpenses: 66_000,
    monthlyBudgets,
    annualExpenses,
    savingsGoals,
  });

  return { assumptions, ledger: ledgerSchema.parse(ledger) };
}
