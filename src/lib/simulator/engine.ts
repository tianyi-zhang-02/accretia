import type {
  Assumptions,
  CareerStage,
  MajorExpense,
  Person,
} from '@/lib/validation/scenarios';

/**
 * Pure deterministic simulation engine. No DB, no network, no randomness.
 *
 * ## Simplifying assumptions (documented for honesty about scope)
 *
 *   1. **Flat effective tax rate.** `effectiveTaxRatePct` is applied as a
 *      single household-wide multiplier on gross income. No federal/state
 *      brackets, no FICA, no tax-advantaged account modeling, no
 *      preferential treatment of long-term capital gains or qualified
 *      dividends. Tune the rate to absorb whatever blend matches your
 *      situation.
 *   2. **Single asset pool.** All wealth is treated as one balance growing
 *      at `investment.returnPct` per year (with low/high variants for
 *      the band). No cash-vs-invested split, no bond/stock allocation, no
 *      sequence-of-returns risk. The spec calls this out explicitly.
 *   3. **No Social Security, no pensions, no annuities.** Income outside
 *      the career stages comes only from windfalls.
 *   4. **No mortgage modeling.** A house down payment is just a major
 *      expense; subsequent mortgage payments belong in
 *      `recurringAnnualExpenses` (which inflates with CPI).
 *   5. **Start-of-year growth convention.** Each year, this year's
 *      `investmentGrowth` is computed from the END of last year's
 *      balance, BEFORE this year's contributions, windfalls, and any
 *      shortfall draws. New money therefore doesn't compound within its
 *      first year.
 *   6. **Savings-rate vs expenses cash flow.**
 *      - intendedContribution = afterTaxIncome × savingsRate%
 *      - consumable = afterTaxIncome − intendedContribution
 *      - If expenses ≤ consumable: `saved = intendedContribution`. The
 *        leftover `consumable − expenses` is treated as discretionary
 *        spending (lifestyle absorption), NOT extra savings.
 *      - If expenses > consumable: `shortfall = expenses − consumable`
 *        and `saved = intendedContribution − shortfall`, which can go
 *        negative — that's a drawdown from the investment balance.
 *      - Windfalls always go straight to the balance, untaxed.
 *   7. **Inflation.** `recurringAnnualExpenses` is multiplied by
 *      `(1 + inflation)^yearsElapsed`. Salaries already grow via
 *      `annualRaisePct`, so do NOT add inflation on top of them — the
 *      raise number is meant to be NOMINAL (above-zero raise = real
 *      raise + inflation).
 *   8. **Real (today-dollars) net worth.** `netWorthRealTodayDollars =
 *      netWorth / (1 + inflation)^yearsElapsed`.
 *
 * The engine is intentionally forgiving about unknown keys on the
 * `Assumptions` object — anything not enumerated below is ignored. This
 * keeps stored scenarios forward-compatible with future engine versions.
 */

export type YearRow = {
  year: number;
  /** Per-person age at year-end of this simulation year, keyed by person.id. */
  ages: Record<string, number>;
  grossIncome: number;
  afterTaxIncome: number;
  /** Recurring + active major expenses. */
  expenses: number;
  windfalls: number;
  /** Net added to the invested balance this year. Can be negative (drawdown). */
  saved: number;
  /** This year's growth on the start-of-year balance. */
  investmentGrowth: number;
  /** End-of-year balance after growth + saved + windfalls. */
  investedBalance: number;
  /** Single-pool net worth = investedBalance (see assumption #2). */
  netWorth: number;
  /** netWorth deflated by cumulative inflation back to horizonStartYear dollars. */
  netWorthRealTodayDollars: number;
};

export type SimulationResult = {
  rows: YearRow[];
  low: YearRow[];
  high: YearRow[];
};

export function simulate(assumptions: Assumptions): SimulationResult {
  return {
    rows: simulateScenario(assumptions, assumptions.investment.returnPct),
    low: simulateScenario(assumptions, assumptions.investment.returnPctLow),
    high: simulateScenario(assumptions, assumptions.investment.returnPctHigh),
  };
}

function simulateScenario(a: Assumptions, returnPct: number): YearRow[] {
  const rows: YearRow[] = [];
  let balance = a.startingNetWorth;

  const totalYears = a.horizonEndYear - a.horizonStartYear + 1;
  for (let i = 0; i < totalYears; i += 1) {
    const year = a.horizonStartYear + i;
    const yearsElapsed = i;

    // 1. Income (gross) summed across people.
    const ages: Record<string, number> = {};
    let grossIncome = 0;
    for (const p of a.people) {
      ages[p.id] = year - p.birthYear;
      grossIncome += personSalaryForYear(p, year);
    }
    const afterTaxIncome = grossIncome * (1 - a.effectiveTaxRatePct / 100);

    // 2. Expenses (recurring, inflated + active major-expense rows).
    const inflationFactor = Math.pow(1 + a.inflationPct / 100, yearsElapsed);
    const baselineExpenses = a.recurringAnnualExpenses * inflationFactor;
    let majorExpensesThisYear = 0;
    for (const e of a.majorExpenses) majorExpensesThisYear += amountForYear(e, year);
    const expenses = baselineExpenses + majorExpensesThisYear;

    // 3. Windfalls — one-time, always go to the pool.
    let windfalls = 0;
    for (const w of a.windfalls) if (w.year === year) windfalls += w.amount;

    // 4. Cash-flow logic (see assumption #6).
    const intendedContribution = afterTaxIncome * (a.annualSavingsRatePct / 100);
    const consumable = afterTaxIncome - intendedContribution;
    let saved: number;
    if (expenses <= consumable) {
      saved = intendedContribution;
    } else {
      const shortfall = expenses - consumable;
      saved = intendedContribution - shortfall; // can be negative
    }

    // 5. Start-of-year growth, then end-of-year adjustments.
    const investmentGrowth = balance * (returnPct / 100);
    balance = balance + investmentGrowth + saved + windfalls;

    const netWorth = balance;
    const netWorthRealTodayDollars = netWorth / inflationFactor;

    rows.push({
      year,
      ages,
      grossIncome,
      afterTaxIncome,
      expenses,
      windfalls,
      saved,
      investmentGrowth,
      investedBalance: balance,
      netWorth,
      netWorthRealTodayDollars,
    });
  }

  return rows;
}

/**
 * Active career stage for a person in a given year, computed as the latest
 * stage whose `startAge` is ≤ the person's age that year. Returns 0 when
 * no stage is active (still in school, retired, between jobs).
 */
function personSalaryForYear(person: Person, year: number): number {
  const age = year - person.birthYear;
  let active: CareerStage | null = null;
  for (const stage of person.careerStages) {
    if (stage.startAge <= age && (active === null || stage.startAge > active.startAge)) {
      active = stage;
    }
  }
  if (!active) return 0;
  const yearsIntoStage = age - active.startAge;
  const base = active.baseSalary * Math.pow(1 + active.annualRaisePct / 100, yearsIntoStage);
  const bonus = base * ((active.bonusPct ?? 0) / 100);
  return base + bonus;
}

/**
 * Returns the dollar amount that this major-expense row contributes in the
 * given year. Handles both shapes: one-time `{year, amount}` and
 * recurring `{startYear, annualAmount, years}`.
 */
function amountForYear(e: MajorExpense, year: number): number {
  if ('year' in e) {
    return e.year === year ? e.amount : 0;
  }
  if (year >= e.startYear && year < e.startYear + e.years) {
    return e.annualAmount;
  }
  return 0;
}
