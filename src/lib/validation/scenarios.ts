import { z } from 'zod';

// ---------- Building blocks ----------

const label = z.string().trim().min(1).max(80);
const year = z.number().int().min(1900).max(2200);
const age = z.number().min(0).max(120);
const money = z
  .number()
  .min(-1e12)
  .max(1e12)
  .refine((n) => Number.isFinite(n), 'must be finite');
const positiveMoney = z
  .number()
  .min(0)
  .max(1e12)
  .refine((n) => Number.isFinite(n), 'must be finite');
const pct = z.number().min(-100).max(500);

const careerStageSchema = z.object({
  label,
  startAge: age,
  baseSalary: positiveMoney,
  annualRaisePct: z.number().min(-50).max(100),
  bonusPct: z.number().min(0).max(500).optional(),
  /**
   * Annual equity / RSU compensation in nominal dollars. Optional (older
   * scenarios have none). Added flat to gross income each year of the
   * stage and taxed as ordinary income (RSUs vest as W-2 income).
   */
  annualEquity: positiveMoney.optional(),
});
export type CareerStage = z.infer<typeof careerStageSchema>;

const personSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  birthYear: year,
  careerStages: z.array(careerStageSchema).max(20),
});
export type Person = z.infer<typeof personSchema>;

// majorExpenses can be a one-time event or a recurring stream.
const oneTimeMajorSchema = z.object({
  label,
  year,
  amount: money,
});
const recurringMajorSchema = z.object({
  label,
  startYear: year,
  annualAmount: money,
  years: z.number().int().min(1).max(200),
});
export const majorExpenseSchema = z.union([oneTimeMajorSchema, recurringMajorSchema]);
export type MajorExpense = z.infer<typeof majorExpenseSchema>;

const windfallSchema = z.object({
  label,
  year,
  amount: money,
});
export type Windfall = z.infer<typeof windfallSchema>;

const investmentSchema = z
  .object({
    returnPct: z.number().min(-50).max(100),
    returnPctLow: z.number().min(-50).max(100),
    returnPctHigh: z.number().min(-50).max(100),
  })
  .refine((v) => v.returnPctLow <= v.returnPct && v.returnPct <= v.returnPctHigh, {
    message: 'returnPctLow ≤ returnPct ≤ returnPctHigh',
  });
export type Investment = z.infer<typeof investmentSchema>;

/**
 * Lifestyle-creep settings. Optional — scenarios saved before Feature 3
 * have no `lifestyle` key and default to the pre-creep behavior
 * (engine treats this as `mode: 'flat'`, `lifestyleCreepPct: 0`).
 *
 * Mode `flat`: spending grows at inflation **plus** `lifestyleCreepPct`
 * per year — purely time-based, doesn't look at income.
 *
 * Mode `incomeScaled`: spending tracks income raises — each year,
 * `creepShareOfRaisePct` % of any after-tax raise is absorbed into the
 * baseline. The remaining baseline still inflates by `inflationPct`
 * year-over-year.
 *
 * Creep only moves the expense side, which directly reduces derived
 * savings (savings = after-tax income − spending). See the engine header.
 */
const lifestyleSchema = z.object({
  mode: z.enum(['flat', 'incomeScaled']),
  /** Used in `flat` mode. Annual lifestyle drift above inflation, in %. */
  lifestyleCreepPct: z.number().min(-50).max(50),
  /** Used in `incomeScaled` mode. % of each after-tax raise absorbed into baseline expenses. */
  creepShareOfRaisePct: z.number().min(0).max(100),
});
export type Lifestyle = z.infer<typeof lifestyleSchema>;

/**
 * Goal-seek target. Optional — when absent, the goal-seek panel is
 * not shown. `age` refers to the primary (first) person's age. Solver
 * extends the simulation horizon internally as needed.
 */
const targetSchema = z.object({
  amount: positiveMoney,
  age: age,
});
export type SimTarget = z.infer<typeof targetSchema>;

/**
 * FIRE (financial-independence) settings. Optional — when absent the FIRE
 * panel uses sensible defaults (4% withdrawal, no health-insurance reserve,
 * essential spend = full recurring expenses). All figures are in
 * horizon-start ("today's") dollars, matching `recurringAnnualExpenses` and
 * the engine's `netWorthRealTodayDollars`.
 */
const fireSchema = z.object({
  /** Safe withdrawal rate, %. FIRE number = annual spend ÷ (rate/100). */
  safeWithdrawalRatePct: z.number().min(0.5).max(20),
  /** Annual health-insurance reserve, added to spending (pre-Medicare in the US). */
  annualHealthInsurance: positiveMoney,
  /** Bare-minimum annual spend used for the Lean-FIRE number. */
  essentialAnnualExpenses: positiveMoney,
});
export type FireConfig = z.infer<typeof fireSchema>;

// ---------- Top-level assumptions ----------

export const assumptionsSchema = z
  .object({
    horizonStartYear: year,
    horizonEndYear: year,
    people: z.array(personSchema).max(10),
    startingNetWorth: money,
    startingInvested: positiveMoney,
    // NOTE: savings is DERIVED (after-tax income − spending), not an input.
    // `annualSavingsRatePct` was removed; imported files that still carry it
    // are accepted (zod strips unknown keys) and the value is ignored.
    effectiveTaxRatePct: z.number().min(0).max(80),
    investment: investmentSchema,
    inflationPct: z.number().min(-20).max(50),
    windfalls: z.array(windfallSchema).max(100),
    majorExpenses: z.array(majorExpenseSchema).max(100),
    recurringAnnualExpenses: positiveMoney,
    // Added in Feature 3 (simulator v2). Optional for back-compat with
    // scenarios saved before this field existed.
    lifestyle: lifestyleSchema.optional(),
    // Added in Feature 4 (simulator v2). Optional — when absent, the
    // goal-seek panel is not rendered.
    target: targetSchema.optional(),
    // Additional annual savings in nominal dollars, added on top of the
    // derived savings. Used as the goal-seek "save $X/mo more" lever;
    // defaults to 0 if absent.
    extraAnnualContribution: positiveMoney.optional(),
    // FIRE panel settings. Optional — the panel falls back to defaults.
    fire: fireSchema.optional(),
  })
  .refine((v) => v.horizonEndYear >= v.horizonStartYear, {
    message: 'horizonEndYear must be ≥ horizonStartYear',
  })
  .refine((v) => v.startingInvested <= Math.max(0, v.startingNetWorth), {
    message: 'startingInvested cannot exceed startingNetWorth',
  });

export type Assumptions = z.infer<typeof assumptionsSchema>;

// ---------- Scenario row schemas ----------

export const createScenarioSchema = z.object({
  name: z.string().trim().min(1).max(80),
  assumptions: assumptionsSchema,
});
export type CreateScenarioInput = z.infer<typeof createScenarioSchema>;

export const updateScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    assumptions: assumptionsSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.assumptions !== undefined, {
    message: 'no fields to update',
  });
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;

// Silence "unused" on shared `pct` symbol — kept for downstream forms.
export { pct };
