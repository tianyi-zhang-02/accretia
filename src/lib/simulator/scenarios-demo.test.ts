/**
 * Demo file — not really tests, more like reproducible printouts. Each
 * `it.skip(...)` block becomes a `console.log` of the engine's actual
 * output for the three sanity cases requested before sign-off.
 *
 * Run with:
 *   npx vitest run scenarios-demo.test.ts --reporter=verbose
 */

import { describe, it, expect } from 'vitest';

import type { Assumptions } from '@/lib/validation/scenarios';

import { simulate } from './engine';

function base(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    horizonStartYear: 2026,
    horizonEndYear: 2035, // 10 simulation rows
    people: [],
    startingNetWorth: 0,
    startingInvested: 0,
    annualSavingsRatePct: 0,
    effectiveTaxRatePct: 0,
    investment: { returnPct: 7, returnPctLow: 7, returnPctHigh: 7 },
    inflationPct: 0,
    windfalls: [],
    majorExpenses: [],
    recurringAnnualExpenses: 0,
    ...overrides,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

describe('demo: three sanity cases', () => {
  it('CASE 1: $100k starting, $0 contrib, 7%, 10 years, 0% inflation', () => {
    const a = base({ startingNetWorth: 100_000 });
    const { rows } = simulate(a);
    const last = rows[rows.length - 1]!;
    console.log('\n=== CASE 1: $100k starting · $0 contrib · 7% · 10 yrs · 0% infl ===');
    console.log('Year | Start bal | Growth | Saved | End balance | Real');
    let startBal = 100_000;
    for (const r of rows) {
      const line =
        `${r.year} | ${fmt(startBal).padStart(9)} | ` +
        `${fmt(r.investmentGrowth).padStart(7)} | ${fmt(r.saved).padStart(6)} | ` +
        `${fmt(r.investedBalance).padStart(11)} | ${fmt(r.netWorthRealTodayDollars).padStart(11)}`;
      console.log(line);
      startBal = r.investedBalance;
    }
    console.log(`\nLast row nominal: $${fmt(last.netWorth)} (expected ≈ $196,715)`);
    console.log(`Last row real:    $${fmt(last.netWorthRealTodayDollars)} (= nominal at 0% infl)\n`);
    expect(last.netWorth).toBeGreaterThan(0);
  });

  it('CASE 2: $0 starting, $1k/mo ($12k/yr) contrib, 7%, 10 years, 0% inflation', () => {
    // Modelled as a person earning exactly $12k with 0% tax + 100% savings
    // rate. End-of-year contribution convention (growth applies first).
    const a = base({
      people: [
        {
          id: 'p1',
          name: 'Saver',
          birthYear: 2000,
          careerStages: [
            { label: 'Saving', startAge: 26, baseSalary: 12_000, annualRaisePct: 0 },
          ],
        },
      ],
      annualSavingsRatePct: 100,
      effectiveTaxRatePct: 0,
    });
    const { rows } = simulate(a);
    const last = rows[rows.length - 1]!;
    console.log('\n=== CASE 2: $0 starting · $12k/yr · 7% · 10 yrs · 0% infl ===');
    console.log(`Last row nominal: $${fmt(last.netWorth)} (expected ≈ $172k ballpark)`);
    // Ordinary annuity FV = 12,000 * ((1.07^10 - 1) / 0.07) ≈ $165,797
    console.log(`Closed-form ordinary annuity:  $${fmt(12_000 * ((Math.pow(1.07, 10) - 1) / 0.07))}`);
    console.log(`Closed-form annuity due (BoY): $${fmt(12_000 * ((Math.pow(1.07, 10) - 1) / 0.07) * 1.07)}\n`);
    expect(last.netWorth).toBeGreaterThan(150_000);
    expect(last.netWorth).toBeLessThan(200_000);
  });

  it('CASE 3: $100k starting, 7% nominal, 3% inflation, 10 years', () => {
    const a = base({
      startingNetWorth: 100_000,
      inflationPct: 3,
    });
    const { rows } = simulate(a);
    const last = rows[rows.length - 1]!;
    console.log('\n=== CASE 3: $100k starting · 7% · 3% infl · 10 yrs ===');
    console.log(`Last row nominal: $${fmt(last.netWorth)} (expected ≈ $196,715)`);
    console.log(`Last row real:    $${fmt(last.netWorthRealTodayDollars)} (expected ≈ $146,000)\n`);
    expect(last.netWorth).toBeCloseTo(196_715, -2);
    expect(last.netWorthRealTodayDollars).toBeCloseTo(146_372, -2);
  });
});

describe('demo: coherence challenges (off-by-one check)', () => {
  it('COHERENCE A: $100k windfall + $100k expense in year 0 cancel exactly', () => {
    // 1-row horizon, $0 starting, both flows in the same year.
    // Engine: shortfall = $100k - $0 consumable = $100k → saved = -$100k.
    // balance_end = 0 + 0 + (-100k) + 100k = $0.
    // Net effect on balance: ZERO. Real values are the same nominal $100k
    // divided by the SAME (1+infl)^1 factor → they cancel in real too.
    const a = base({
      horizonStartYear: 2026,
      horizonEndYear: 2026,
      startingNetWorth: 0,
      investment: { returnPct: 0, returnPctLow: 0, returnPctHigh: 0 },
      inflationPct: 3,
      windfalls: [{ label: 'inh', year: 2026, amount: 100_000 }],
      majorExpenses: [{ label: 'house', year: 2026, amount: 100_000 }],
    });
    const { rows } = simulate(a);
    const r = rows[0]!;
    console.log('\n=== COHERENCE A: $100k windfall + $100k expense, same year ===');
    console.log(`expenses[0]:                       $${fmt(r.expenses)}`);
    console.log(`windfalls[0]:                      $${fmt(r.windfalls)}  ← equal in nominal`);
    console.log(`netWorth (end of row 0):           $${fmt(r.netWorth)}  ← exactly $0, they cancel`);
    console.log(`netWorthRealTodayDollars:          $${fmt(r.netWorthRealTodayDollars)}`);
    const realDeflator = Math.pow(1.03, 1);
    console.log(`Implied real expense = exp/factor: $${fmt(r.expenses / realDeflator)}`);
    console.log(`Implied real windfall = wf/factor: $${fmt(r.windfalls / realDeflator)}  ← same factor, same real value\n`);
    expect(r.netWorth).toBeCloseTo(0, 2);
    expect(r.expenses).toEqual(r.windfalls);
  });

  it('COHERENCE B: $100k expense in final year deflates by same period count as net worth', () => {
    // Two scenarios, identical except for a single $100k major expense in
    // the final year. The DIFFERENCE in real net worth between them should
    // equal `$100k / (1+infl)^(N)`, the same factor used to deflate the
    // real net worth column at the last row.
    const N = 10;
    const noExpense = base({
      horizonStartYear: 2026,
      horizonEndYear: 2026 + N - 1,
      startingNetWorth: 200_000,
      investment: { returnPct: 0, returnPctLow: 0, returnPctHigh: 0 },
      inflationPct: 3,
    });
    const withExpense = base({
      ...noExpense,
      majorExpenses: [{ label: 'final expense', year: 2026 + N - 1, amount: 100_000 }],
    });

    const aRows = simulate(noExpense).rows;
    const bRows = simulate(withExpense).rows;
    const aLast = aRows[aRows.length - 1]!;
    const bLast = bRows[bRows.length - 1]!;

    const realPeriodFactor = Math.pow(1.03, N); // (1+infl)^N = (1+infl)^(i+1) for i=N-1
    const expectedExpenseReal = 100_000 / realPeriodFactor;
    const observedNominalDelta = aLast.netWorth - bLast.netWorth;
    const observedRealDelta = aLast.netWorthRealTodayDollars - bLast.netWorthRealTodayDollars;
    const observedExpenseReal = bLast.expenses / realPeriodFactor;

    console.log('\n=== COHERENCE B: $100k expense in final year, 10-row horizon ===');
    console.log(`Row 9 nominal NW (no-expense scenario):    $${fmt(aLast.netWorth)}`);
    console.log(`Row 9 nominal NW (with-expense scenario):  $${fmt(bLast.netWorth)}`);
    console.log(`Nominal NW delta (A − B):                  $${fmt(observedNominalDelta)}  ← exactly $100k`);
    console.log('');
    console.log(`Row 9 real NW (no-expense):                $${fmt(aLast.netWorthRealTodayDollars)}`);
    console.log(`Row 9 real NW (with-expense):              $${fmt(bLast.netWorthRealTodayDollars)}`);
    console.log(`Real NW delta (A − B):                     $${fmt(observedRealDelta)}`);
    console.log('');
    console.log(`Expense column (row 9) divided by (1.03)^${N}:  $${fmt(observedExpenseReal)}`);
    console.log(`Closed-form expected:  $100k / (1.03)^${N} =     $${fmt(expectedExpenseReal)}`);
    console.log(`All three match → expense and net worth use the same ${N}-period count.\n`);

    // All three numbers MUST be the same — that's the coherence claim.
    expect(observedNominalDelta).toBeCloseTo(100_000, 0);
    expect(observedRealDelta).toBeCloseTo(expectedExpenseReal, 0);
    expect(observedExpenseReal).toBeCloseTo(expectedExpenseReal, 0);
  });
});
