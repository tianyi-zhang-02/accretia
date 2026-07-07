import type {
  Assumptions,
  CareerStage,
  Lifestyle,
  MajorExpense,
  Person,
  StressConfig,
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
 *   6. **Derived-savings cash flow.** Savings is not a knob — it falls out
 *      of income, tax, and spending:
 *        `afterTaxIncome = grossIncome × (1 − effectiveTaxRatePct/100)`
 *        `saved = afterTaxIncome − expenses + extraAnnualContribution`
 *      - `saved` can go negative — that's a drawdown from the invested
 *        balance (spending exceeds after-tax income).
 *      - Windfalls always go straight to the balance, untaxed (separate
 *        from `saved`).
 *      - `grossIncome` includes salary + bonus + equity (RSUs) across all
 *        people; see `personSalaryForYear`. All of it is taxed at the flat
 *        effective rate (RSUs vest as ordinary income).
 *      - `extraAnnualContribution` is the additional savings dollars used
 *        by the goal-seek "save $X/mo more" lever. Defaults to 0. In this
 *        derived model it is mathematically identical to reducing expenses
 *        by the same amount.
 *      - The **implied savings rate** (`saved / afterTaxIncome`) is a
 *        derived OUTPUT the UI can display; it is not an input.
 *   6a. **Lifestyle creep.** Only moves the expense side (which then
 *      directly reduces `saved` per #6). Per `assumptions.lifestyle.mode`:
 *      - Absent OR `flat` with `lifestyleCreepPct=0`: no creep.
 *        `expenses_i = recurringAnnualExpenses × (1+infl)^(i+1) + major[i]`.
 *      - `flat`: expenses grow at inflation AND a lifestyle drift rate.
 *        `expenses_i = recurringAnnualExpenses
 *                      × (1+infl)^(i+1)
 *                      × (1+creep)^(i+1)
 *                      + major[i]`.
 *      - `incomeScaled`: expenses start at the same year-0 baseline as
 *        flat, then each subsequent year inflate the prior baseline AND
 *        absorb `creepShareOfRaisePct` % of any after-tax raise:
 *        `baseline_0   = recurringAnnualExpenses × (1+infl)`
 *        `baseline_i+1 = baseline_i × (1+infl)
 *                        + max(0, afterTax_i+1 − afterTax_i)
 *                          × creepShareOfRaisePct/100`
 *        `expenses_i   = baseline_i + major[i]`.
 *      A pay cut is clamped (`max(0, …)`) so lifestyle is sticky downward.
 *   7. **Inflation — coherent end-of-year convention.**
 *      Every value in row i is interpreted as T=i+1 nominal
 *      (end-of-year-i). Concretely:
 *      - Investment growth implicitly converts T=i nominal balance to
 *        T=i+1 nominal via `× (1 + returnPct)`, so balance_end_row_i
 *        already lives in T=i+1 nominal.
 *      - `recurringAnnualExpenses` is the user's spend in today's
 *        dollars (T=0). Row i's nominal expenses apply
 *        `(1+infl)^(i+1)` — the first horizon year is one inflation
 *        period from "now."
 *      - Major-expense and windfall face values are taken as-is in
 *        their row's nominal currency (T=i+1). No internal factor.
 *      - Real (today-dollars) value of anything in row i:
 *        `value / (1+infl)^(i+1)`. Expense column and net-worth column
 *        in the same row deflate by EXACTLY THE SAME factor.
 *      - Salaries already grow via `annualRaisePct` (NOMINAL); don't
 *        add inflation on top.
 *   8. **Real net worth.** `netWorthRealTodayDollars = netWorth /
 *      (1 + inflation)^(yearsElapsed + 1)`, computed from the same
 *      `expenseInflationFactor` variable below to make the coherence
 *      visible at the call site.
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

export function simulate(assumptions: Assumptions, stress?: StressConfig): SimulationResult {
  return {
    rows: simulateScenario(assumptions, assumptions.investment.returnPct, stress),
    low: simulateScenario(assumptions, assumptions.investment.returnPctLow, stress),
    high: simulateScenario(assumptions, assumptions.investment.returnPctHigh, stress),
  };
}

/**
 * Defaults applied when `assumptions.lifestyle` is absent — preserves the
 * pre-creep formula exactly: `expenses = base × (1+infl)^(i+1)`.
 */
function resolveLifestyle(a: Assumptions): Lifestyle {
  return (
    a.lifestyle ?? {
      mode: 'flat',
      lifestyleCreepPct: 0,
      creepShareOfRaisePct: 0,
    }
  );
}

function simulateScenario(a: Assumptions, returnPct: number, stress?: StressConfig): YearRow[] {
  const rows: YearRow[] = [];
  let balance = a.startingNetWorth;

  const lifestyle = resolveLifestyle(a);
  const inflRate = a.inflationPct / 100;
  const creepRate = lifestyle.lifestyleCreepPct / 100;
  const creepShare = lifestyle.creepShareOfRaisePct / 100;
  const extraContribution = a.extraAnnualContribution ?? 0;

  // For `incomeScaled` mode we need to walk year-to-year carrying the
  // previous baseline and the previous after-tax income so we can add
  // creepShare × ΔafterTax to next year's baseline.
  let prevBaselineExpenses = 0;
  let prevAfterTaxIncome = 0;

  const totalYears = a.horizonEndYear - a.horizonStartYear + 1;
  for (let i = 0; i < totalYears; i += 1) {
    const year = a.horizonStartYear + i;
    const yearsElapsed = i;

    // 1. Income (gross) summed across people.
    const ages: Record<string, number> = {};
    let grossIncome = 0;
    for (const p of a.people) {
      ages[p.id] = year - p.birthYear;
      let salary = personSalaryForYear(p, year);
      // Stress: job-loss income interruption. During the window, the affected
      // person's pay scales to incomeReplacementPct (0 = full loss).
      const jl = stress?.jobLoss;
      if (
        jl &&
        (jl.personId === undefined || jl.personId === p.id) &&
        year >= jl.startYear &&
        year < jl.startYear + jl.years
      ) {
        salary *= jl.incomeReplacementPct / 100;
      }
      grossIncome += salary;
    }
    const afterTaxIncome = grossIncome * (1 - a.effectiveTaxRatePct / 100);

    // 2. Expenses. The recurring/inflation-only convention (T=i+1 nominal)
    // is preserved; lifestyle-creep stacks on top per assumption #6a.
    const expenseInflationFactor = Math.pow(1 + inflRate, yearsElapsed + 1);

    let baselineExpenses: number;
    if (lifestyle.mode === 'flat') {
      // (1+infl)^(i+1) × (1+creep)^(i+1). When creep=0 this collapses to
      // the pre-Feature-3 formula exactly.
      const creepFactor = Math.pow(1 + creepRate, yearsElapsed + 1);
      baselineExpenses = a.recurringAnnualExpenses * expenseInflationFactor * creepFactor;
    } else {
      // incomeScaled: anchor year 0 at the same place as flat (one
      // inflation period from "now"), then accrete creep from raises
      // year-over-year. ΔafterTax can be negative (income drop, retirement)
      // — clamp to ≥ 0 so a pay cut doesn't *reduce* lifestyle spending.
      if (i === 0) {
        baselineExpenses = a.recurringAnnualExpenses * (1 + inflRate);
      } else {
        const raise = Math.max(0, afterTaxIncome - prevAfterTaxIncome);
        baselineExpenses = prevBaselineExpenses * (1 + inflRate) + raise * creepShare;
      }
    }
    let majorExpensesThisYear = 0;
    for (const e of a.majorExpenses) majorExpensesThisYear += amountForYear(e, year);
    const expenses = baselineExpenses + majorExpensesThisYear;

    // 3. Windfalls — one-time, always go to the pool.
    let windfalls = 0;
    for (const w of a.windfalls) if (w.year === year) windfalls += w.amount;

    // 4. Cash-flow (see assumption #6): savings is DERIVED — what you don't
    // pay in tax or spend, you save. No separate savings-rate knob.
    //   saved = afterTaxIncome − expenses + extraContribution
    // Can go negative — that's a drawdown from the invested balance.
    // `extraContribution` is the goal-seek "save $X/mo more" lever; it's
    // additive and defaults to 0.
    const saved = afterTaxIncome - expenses + extraContribution;

    // 5. Start-of-year growth, then end-of-year adjustments. A market-shock
    // stress overrides the return for that single year (e.g. −37% crash).
    const yearReturnPct =
      stress?.marketShock && stress.marketShock.year === year
        ? stress.marketShock.returnPct
        : returnPct;
    const investmentGrowth = balance * (yearReturnPct / 100);
    balance = balance + investmentGrowth + saved + windfalls;

    const netWorth = balance;
    // Same factor as expenseInflationFactor above — coherence by
    // construction. Row i values are all in T=i+1 nominal.
    const netWorthRealTodayDollars = netWorth / expenseInflationFactor;

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

    // Carry forward for the next year of incomeScaled mode.
    prevBaselineExpenses = baselineExpenses;
    prevAfterTaxIncome = afterTaxIncome;
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
  // Equity / RSU comp is added flat per year of the stage (not compounded by
  // annualRaisePct — grants refresh lumpily rather than "raising"). Treated
  // as ordinary taxable income, like salary, since RSUs vest as W-2 income.
  const equity = active.annualEquity ?? 0;
  return base + bonus + equity;
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
