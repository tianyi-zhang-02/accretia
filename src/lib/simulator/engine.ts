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
 *   2. **Two pools: invested vs cash.** Only the `invested` pool (seeded by
 *      `startingInvested`) earns `investment.returnPct`; the `cash` pool —
 *      the rest of starting net worth plus the un-invested share of each
 *      year's surplus — counts toward net worth but earns NOTHING. Bills
 *      come first: shortfalls and housing costs draw cash before touching
 *      investments. `investedSharePct` (default 100) sets how much of a
 *      positive surplus actually gets invested. No bond/stock allocation
 *      within the invested pool.
 *   3. **Retirement phase.** Each person's career income stops at their
 *      optional `retireAge` (absent = works to the horizon end). From the
 *      PRIMARY person's retirement year, `retirement.spendingPct` scales the
 *      recurring baseline (majors are untouched) and
 *      `retirement.postReturnPct` replaces the base return (the low/high
 *      band keeps its spread). `otherIncomes[]` — social security, pensions,
 *      rental, annuities — pay from a start age (keyed to the primary
 *      person), in today's dollars when inflation-adjusted (the default),
 *      and are taxed at the flat rate like all income.
 *   4. **Optional home + mortgage.** When `assumptions.mortgage` is set,
 *      net worth = invested + cash + (home value − mortgage balance): the
 *      down payment converts cash→equity, each payment splits into interest
 *      (a cost) and principal (equity), property tax + maintenance are
 *      costs, and the home appreciates. Absent = no housing modeled.
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
 *      - Pay need not be predictable: a stage may declare `volatilityPct`
 *        (one std dev of total comp, % — partner draws, commission). The
 *        deterministic projection shows the expected path; Monte Carlo
 *        draws each such person-year's comp via `sampleIncome`.
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
  /** Money kept this year (surplus + extra contribution). Can be negative (drawdown). */
  saved: number;
  /** This year's growth on the start-of-year INVESTED pool (cash earns nothing). */
  investmentGrowth: number;
  /** End-of-year invested pool — excludes the cash pool and home equity. */
  investedBalance: number;
  /** invested + cash + home equity (see assumptions #2 and #4). */
  netWorth: number;
  /** netWorth deflated by cumulative inflation back to horizonStartYear dollars. */
  netWorthRealTodayDollars: number;
  /**
   * Home equity (home value − mortgage balance) deflated to today's dollars;
   * 0 with no mortgage. FIRE milestones use netWorthReal − this, since you
   * can't withdraw 4% of a house.
   */
  homeEquityRealTodayDollars: number;
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

/**
 * Runs one scenario at a constant `returnPct`. `stress` applies the optional
 * what-if shocks; `sampleReturn(i)` (used by Monte Carlo) supplies a per-year
 * return that overrides the constant — when omitted, behaviour is unchanged.
 * `sampleIncome(i, volatilityPct)` (also Monte Carlo) supplies a multiplicative
 * factor on a person-year's comp, called ONLY for stages that declare
 * `volatilityPct` — deterministic runs (and stable stages) never see it.
 * Exported so the Monte-Carlo layer can reuse the exact cash-flow math.
 */
export function simulateScenario(
  a: Assumptions,
  returnPct: number,
  stress?: StressConfig,
  sampleReturn?: (yearIndex: number) => number,
  sampleIncome?: (yearIndex: number, volatilityPct: number) => number,
): YearRow[] {
  const rows: YearRow[] = [];
  // Two pools (assumption #2): only `invested` compounds; `cash` is the rest
  // of net worth — the starting gap plus every year's un-invested surplus.
  let invested = a.startingInvested;
  let cash = a.startingNetWorth - a.startingInvested;

  const lifestyle = resolveLifestyle(a);
  const inflRate = a.inflationPct / 100;
  const creepRate = lifestyle.lifestyleCreepPct / 100;
  const creepShare = lifestyle.creepShareOfRaisePct / 100;
  const extraContribution = a.extraAnnualContribution ?? 0;
  const investedShare = (a.investedSharePct ?? 100) / 100;

  // Pay a cost out of the pools: cash first (bills come first), then the
  // invested balance — which may go negative; a sustained shortfall keeps
  // compounding against you, debt-like, same as the old single-pool model.
  const payFromPools = (amount: number) => {
    const fromCash = Math.min(Math.max(cash, 0), amount);
    cash -= fromCash;
    invested -= amount - fromCash;
  };

  // Home + mortgage state, carried across years. Zero when no mortgage — in
  // that case every housing term below is 0 and net worth is unchanged.
  const m = a.mortgage;
  const loanAmount = m ? m.homePrice * (1 - m.downPaymentPct / 100) : 0;
  const mortgagePayment = m ? annualMortgagePayment(loanAmount, m.mortgageRatePct, m.termYears) : 0;
  let homeValue = 0;
  let mortgageBalance = 0;

  // Retirement-phase constants (assumption #3), keyed to the primary person.
  const primary = a.people[0];
  const retireYear =
    primary?.retireAge !== undefined ? primary.birthYear + primary.retireAge : null;
  const retSpendShare = a.retirement?.spendingPct;
  const postReturn = a.retirement?.postReturnPct;
  // Keep the low/high band's spread when the post-retirement return kicks in.
  const returnSpreadOffset = returnPct - a.investment.returnPct;

  // For `incomeScaled` mode we need to walk year-to-year carrying the
  // previous baseline and the previous after-tax income so we can add
  // creepShare × ΔafterTax to next year's baseline.
  let prevBaselineExpenses = 0;
  let prevAfterTaxIncome = 0;

  const totalYears = a.horizonEndYear - a.horizonStartYear + 1;
  for (let i = 0; i < totalYears; i += 1) {
    const year = a.horizonStartYear + i;
    const yearsElapsed = i;

    // Inflation factor for this row (T=i+1 nominal) — used by expenses,
    // real-dollar deflation, and inflation-adjusted income streams alike.
    const expenseInflationFactor = Math.pow(1 + inflRate, yearsElapsed + 1);

    // 1. Income (gross) summed across people.
    const ages: Record<string, number> = {};
    let grossIncome = 0;
    for (const p of a.people) {
      ages[p.id] = year - p.birthYear;
      let salary = personSalaryForYear(p, year);
      // Unpredictable pay (partner draws, commission): in Monte Carlo runs,
      // a stage that declares volatilityPct gets a per-year comp draw.
      // Deterministic runs show the expected path.
      if (sampleIncome && salary > 0) {
        const vol = activeStageForAge(p, ages[p.id]!)?.volatilityPct ?? 0;
        if (vol > 0) salary *= Math.max(0, sampleIncome(i, vol));
      }
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
    // Other income streams — social security / pension / rental / annuity,
    // keyed to the primary person's age. Today's dollars when inflation-
    // adjusted (default); fixed nominal otherwise. Taxed like all income.
    if (a.otherIncomes && primary) {
      const pAge = year - primary.birthYear;
      for (const inc of a.otherIncomes) {
        if (pAge >= inc.startAge && (inc.endAge === undefined || pAge <= inc.endAge)) {
          grossIncome +=
            inc.annualAmount * (inc.inflationAdjusted === false ? 1 : expenseInflationFactor);
        }
      }
    }
    const afterTaxIncome = grossIncome * (1 - a.effectiveTaxRatePct / 100);

    // 2. Expenses. The recurring/inflation-only convention (T=i+1 nominal)
    // is preserved; lifestyle-creep stacks on top per assumption #6a.
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
    // Retirement spending change scales the recurring baseline only (explicit
    // major expenses are never scaled). The incomeScaled carry keeps the RAW
    // baseline so the multiplier doesn't compound year over year.
    const retSpendMult =
      retSpendShare !== undefined && retireYear !== null && year >= retireYear
        ? retSpendShare / 100
        : 1;
    const expenses = baselineExpenses * retSpendMult + majorExpensesThisYear;

    // 3. Windfalls — one-time, always go to the pool.
    let windfalls = 0;
    for (const w of a.windfalls) if (w.year === year) windfalls += w.amount;

    // 4. Cash-flow (assumption #6): savings is DERIVED (income − spending).
    // `saved` reports everything you KEPT — the money doesn't vanish just
    // because it isn't invested. Only `investedSharePct` of a positive
    // surplus goes into the invested pool; the rest accumulates as cash
    // (counts in net worth, earns nothing). `extraContribution` — the
    // goal-seek "save $X/mo more" lever — is an explicit investment
    // contribution and is never split.
    const surplus = afterTaxIncome - expenses;
    const saved = surplus + extraContribution;

    // 5. Start-of-year growth on the INVESTED pool only (a market crash hits
    // your portfolio, not your checking account), then route this year's
    // flows. Per-year return priority: market-shock stress (a fixed crash
    // year) > Monte-Carlo sampled return > the constant `returnPct`.
    // From retirement, an (optional) more conservative return takes over —
    // shifted by this run's band offset so low/base/high keep their spread.
    const constantReturn =
      postReturn !== undefined && retireYear !== null && year >= retireYear
        ? postReturn + returnSpreadOffset
        : returnPct;
    const yearReturnPct =
      stress?.marketShock && stress.marketShock.year === year
        ? stress.marketShock.returnPct
        : sampleReturn
          ? sampleReturn(i)
          : constantReturn;
    const investmentGrowth = invested * (yearReturnPct / 100);
    invested += investmentGrowth;

    if (surplus >= 0) {
      invested += surplus * investedShare + extraContribution;
      cash += surplus * (1 - investedShare);
    } else {
      // Shortfall: the extra contribution offsets it first; any remainder
      // draws down cash, then investments.
      const net = surplus + extraContribution;
      if (net >= 0) invested += net;
      else payFromPools(-net);
    }
    // Windfalls follow the same invested share as ordinary savings.
    if (windfalls >= 0) {
      invested += windfalls * investedShare;
      cash += windfalls * (1 - investedShare);
    } else {
      payFromPools(-windfalls);
    }

    // 6. Home + mortgage (assumption #4). Housing costs are bills — they
    // draw cash first, then investments. Only active when `a.mortgage` is set.
    if (m && year >= m.purchaseYear) {
      if (year === m.purchaseYear) {
        // Down payment: out of the pools, into home equity (net-worth-neutral).
        payFromPools(m.homePrice * (m.downPaymentPct / 100));
        homeValue = m.homePrice;
        mortgageBalance = loanAmount;
      }
      const propertyTax = homeValue * (m.propertyTaxPct / 100);
      const maintenance = homeValue * ((m.maintenancePct ?? 0) / 100);
      let payment = 0;
      if (mortgageBalance > 0) {
        const interest = mortgageBalance * (m.mortgageRatePct / 100);
        // Principal builds equity (net-worth-neutral); capped by the last
        // payment. Interest + property tax + maintenance are real costs.
        const principal = Math.min(Math.max(0, mortgagePayment - interest), mortgageBalance);
        mortgageBalance -= principal;
        payment = interest + principal;
      }
      payFromPools(payment + propertyTax + maintenance);
      // Appreciate the home at year end.
      homeValue *= 1 + (m.homeAppreciationPct ?? 0) / 100;
    }
    const homeEquity = homeValue - mortgageBalance;

    const netWorth = invested + cash + homeEquity;
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
      investedBalance: invested,
      netWorth,
      netWorthRealTodayDollars,
      homeEquityRealTodayDollars: homeEquity / expenseInflationFactor,
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
/** Fixed annual mortgage payment (P&I) for a `loan` amortized over `years`. */
function annualMortgagePayment(loan: number, ratePct: number, years: number): number {
  if (loan <= 0 || years <= 0) return 0;
  const r = ratePct / 100;
  if (r === 0) return loan / years;
  return (loan * r) / (1 - Math.pow(1 + r, -years));
}

/** Latest stage whose startAge ≤ age — the one paying this year. */
function activeStageForAge(person: Person, age: number): CareerStage | null {
  let active: CareerStage | null = null;
  for (const stage of person.careerStages) {
    if (stage.startAge <= age && (active === null || stage.startAge > active.startAge)) {
      active = stage;
    }
  }
  return active;
}

function personSalaryForYear(person: Person, year: number): number {
  const age = year - person.birthYear;
  // Retired — career income stops. (Absent retireAge = the old behavior:
  // the latest stage pays forever.)
  if (person.retireAge !== undefined && age >= person.retireAge) return 0;
  const active = activeStageForAge(person, age);
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
