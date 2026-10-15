/**
 * Paycheck calculator — gross pay → take-home, the way a budget sheet does it.
 *
 * EXACT where it can be (each figure checked against the official source):
 *   - Federal income tax, tax year 2026: brackets and standard deduction from
 *     IRS Rev. Proc. 2025-32 (§4.01 Tables 1–3; standard deduction $16,100 /
 *     $32,200 / $24,150).
 *   - Social Security 6.2% up to the 2026 wage base $184,500 (SSA).
 *   - Medicare 1.45%, plus 0.9% Additional Medicare Tax over $200,000
 *     ($250,000 married filing jointly) — statutory, not indexed.
 *   - 401(k) employee deferral limit $24,500 for 2026, $32,500 at 50+ (IRS).
 *   - California: the 2025 FTB rate schedules X/Y/Z, standard deduction
 *     ($5,706 / $11,412) and personal exemption credit ($153 / $306) — the
 *     latest the FTB has published in full — plus the 1% Mental Health
 *     Services Tax over $1M, and SDI at 1.3% with no wage cap (EDD, 2026).
 *     California does not recognise HSAs, so HSA payroll contributions stay
 *     in CA taxable income.
 *   - States with no wage income tax: 0.
 *
 * ESTIMATED elsewhere: other states (New York included) use a flat rate on
 * state-taxable wages that the person can edit; city tax likewise. The UI
 * labels these as estimates.
 *
 * It computes the YEAR's tax liability, not paycheck withholding. A bonus's
 * take-home is its marginal share: tax with the bonus minus tax without it —
 * what it really nets once the return is filed (payroll withholds bonuses at
 * flat supplemental rates, so a single check can differ).
 *
 * Deliberately left out: credits (child tax credit etc.), itemized
 * deductions, AMT, Roth/after-tax contributions, employer match, state
 * disability programs other than California's, and local taxes other than a
 * flat city rate. Estimates, not tax advice.
 */

export const TAX_YEAR = 2026;

export type FilingStatus = 'single' | 'mfj' | 'hoh';

/** [upper bound of the bracket, marginal rate]. The last bound is Infinity. */
type Brackets = ReadonlyArray<readonly [number, number]>;

const FEDERAL: Record<FilingStatus, Brackets> = {
  single: [
    [12_400, 0.1],
    [50_400, 0.12],
    [105_700, 0.22],
    [201_775, 0.24],
    [256_225, 0.32],
    [640_600, 0.35],
    [Infinity, 0.37],
  ],
  mfj: [
    [24_800, 0.1],
    [100_800, 0.12],
    [211_400, 0.22],
    [403_550, 0.24],
    [512_450, 0.32],
    [768_700, 0.35],
    [Infinity, 0.37],
  ],
  hoh: [
    [17_700, 0.1],
    [67_450, 0.12],
    [105_700, 0.22],
    [201_750, 0.24],
    [256_200, 0.32],
    [640_600, 0.35],
    [Infinity, 0.37],
  ],
};
const FEDERAL_STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 16_100,
  mfj: 32_200,
  hoh: 24_150,
};

export const SOCIAL_SECURITY_RATE = 0.062;
export const SOCIAL_SECURITY_WAGE_BASE = 184_500;
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009;
const ADDITIONAL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  mfj: 250_000,
  hoh: 200_000,
};

export const K401_LIMIT = 24_500;
export const K401_LIMIT_50_PLUS = 32_500;

/** California, tax year 2025 (FTB rate schedules X / Y / Z). */
const CALIFORNIA: Record<FilingStatus, Brackets> = {
  single: [
    [11_079, 0.01],
    [26_264, 0.02],
    [41_452, 0.04],
    [57_542, 0.06],
    [72_724, 0.08],
    [371_479, 0.093],
    [445_771, 0.103],
    [742_953, 0.113],
    [Infinity, 0.123],
  ],
  mfj: [
    [22_158, 0.01],
    [52_528, 0.02],
    [82_904, 0.04],
    [115_084, 0.06],
    [145_448, 0.08],
    [742_958, 0.093],
    [891_542, 0.103],
    [1_485_906, 0.113],
    [Infinity, 0.123],
  ],
  hoh: [
    [22_173, 0.01],
    [52_530, 0.02],
    [67_716, 0.04],
    [83_805, 0.06],
    [98_990, 0.08],
    [505_208, 0.093],
    [606_251, 0.103],
    [1_010_417, 0.113],
    [Infinity, 0.123],
  ],
};
const CA_STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 5_706,
  mfj: 11_412,
  hoh: 11_412,
};
const CA_EXEMPTION_CREDIT: Record<FilingStatus, number> = { single: 153, mfj: 306, hoh: 153 };
const CA_MENTAL_HEALTH_THRESHOLD = 1_000_000;
const CA_MENTAL_HEALTH_RATE = 0.01;
export const CA_SDI_RATE = 0.013;
export const CA_TAX_YEAR = 2025;

/** States that don't tax wages. */
export const NO_WAGE_TAX_STATES = ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tax on `taxable` under progressive `brackets`. */
export function bracketTax(taxable: number, brackets: Brackets): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return round2(tax);
}

/** The marginal rate the last dollar of `taxable` pays. */
function marginalRate(taxable: number, brackets: Brackets): number {
  for (const [upper, rate] of brackets) if (taxable <= upper) return rate;
  return brackets.at(-1)![1];
}

export type PaycheckInput = {
  salary: number;
  bonus: number;
  filing: FilingStatus;
  /** Two-letter state code. */
  state: string;
  /** Flat state rate (%) used for states without an exact schedule here. */
  stateRatePct: number;
  /** Flat city rate (%) — e.g. New York City. 0 for none. */
  cityRatePct: number;
  /** Traditional (pre-tax) 401(k) per year; capped at the IRS limit. */
  k401: number;
  /** Age 50+ — raises the 401(k) limit by the catch-up. */
  age50Plus: boolean;
  /** HSA through payroll (cafeteria plan) per year. */
  hsa: number;
  /** Other pre-tax payroll deductions per year: health/dental premiums, commuter. */
  otherPretax: number;
};

export type PaycheckResult = {
  gross: number;
  /** The 401(k) actually deferred (after the limit). */
  k401: number;
  k401Capped: boolean;
  hsa: number;
  otherPretax: number;
  federalTaxable: number;
  federal: number;
  federalMarginalPct: number;
  socialSecurity: number;
  medicare: number;
  state: number;
  /** True when `state` came from an exact schedule (or is a no-tax state). */
  stateExact: boolean;
  /** California SDI; 0 elsewhere. */
  sdi: number;
  city: number;
  totalTax: number;
  /** Take-home for the year: gross − pre-tax deductions − taxes. */
  takeHome: number;
  /** All taxes ÷ gross, % — what a single "effective tax rate" should be. */
  effectiveTaxPct: number;
};

function liability(input: PaycheckInput, salary: number, bonus: number): PaycheckResult {
  const gross = Math.max(0, salary) + Math.max(0, bonus);
  const limit = input.age50Plus ? K401_LIMIT_50_PLUS : K401_LIMIT;
  const k401Wanted = Math.max(0, input.k401);
  const k401 = Math.min(k401Wanted, limit, gross);
  const hsa = Math.min(Math.max(0, input.hsa), Math.max(0, gross - k401));
  const otherPretax = Math.min(Math.max(0, input.otherPretax), Math.max(0, gross - k401 - hsa));

  // Federal income tax: wages less all pre-tax deductions, less the
  // standard deduction.
  const federalWages = gross - k401 - hsa - otherPretax;
  const federalTaxable = Math.max(0, federalWages - FEDERAL_STANDARD_DEDUCTION[input.filing]);
  const federal = bracketTax(federalTaxable, FEDERAL[input.filing]);

  // FICA: 401(k) deferrals ARE subject; cafeteria-plan HSA and premiums are not.
  const ficaWages = gross - hsa - otherPretax;
  const socialSecurity = round2(
    Math.min(ficaWages, SOCIAL_SECURITY_WAGE_BASE) * SOCIAL_SECURITY_RATE,
  );
  const medicare = round2(
    ficaWages * MEDICARE_RATE +
      Math.max(0, ficaWages - ADDITIONAL_MEDICARE_THRESHOLD[input.filing]) *
        ADDITIONAL_MEDICARE_RATE,
  );

  // State.
  let state = 0;
  let sdi = 0;
  let stateExact = true;
  if (input.state === 'CA') {
    // California adds HSA contributions back.
    const caWages = gross - k401 - otherPretax;
    const caTaxable = Math.max(0, caWages - CA_STANDARD_DEDUCTION[input.filing]);
    const caTax =
      bracketTax(caTaxable, CALIFORNIA[input.filing]) +
      Math.max(0, caTaxable - CA_MENTAL_HEALTH_THRESHOLD) * CA_MENTAL_HEALTH_RATE;
    state = round2(Math.max(0, caTax - CA_EXEMPTION_CREDIT[input.filing]));
    // SDI is on gross wages, 401(k) deferrals included; no wage cap.
    sdi = round2((gross - hsa - otherPretax) * CA_SDI_RATE);
  } else if ((NO_WAGE_TAX_STATES as readonly string[]).includes(input.state)) {
    state = 0;
  } else {
    stateExact = false;
    state = round2(federalWages * (Math.max(0, Math.min(20, input.stateRatePct)) / 100));
  }
  const city = round2(federalWages * (Math.max(0, Math.min(10, input.cityRatePct)) / 100));

  const totalTax = round2(federal + socialSecurity + medicare + state + sdi + city);
  return {
    gross,
    k401,
    k401Capped: k401Wanted > limit,
    hsa,
    otherPretax,
    federalTaxable,
    federal,
    federalMarginalPct: marginalRate(federalTaxable, FEDERAL[input.filing]) * 100,
    socialSecurity,
    medicare,
    state,
    stateExact,
    sdi,
    city,
    totalTax,
    takeHome: round2(gross - k401 - hsa - otherPretax - totalTax),
    effectiveTaxPct: gross > 0 ? (totalTax / gross) * 100 : 0,
  };
}

export type Paycheck = PaycheckResult & {
  /** The same year without the bonus — what regular paychecks add up to. */
  salaryOnly: PaycheckResult;
  /** What the bonus nets after its real (marginal) taxes. */
  bonusTakeHome: number;
  bonusTax: number;
  /** Regular take-home per month / per paycheck (salary only). */
  monthly: number;
  biweekly: number;
  semimonthly: number;
};

export function paycheck(input: PaycheckInput): Paycheck {
  const all = liability(input, input.salary, input.bonus);
  const salaryOnly = liability(input, input.salary, 0);
  const bonus = Math.max(0, input.bonus);
  // The bonus's share of the 401(k) is what the deferral grew by.
  const bonusDeferred =
    all.k401 -
    salaryOnly.k401 +
    (all.hsa - salaryOnly.hsa) +
    (all.otherPretax - salaryOnly.otherPretax);
  const bonusTax = round2(all.totalTax - salaryOnly.totalTax);
  return {
    ...all,
    salaryOnly,
    bonusTax,
    bonusTakeHome: round2(bonus - bonusTax - bonusDeferred),
    monthly: round2(salaryOnly.takeHome / 12),
    biweekly: round2(salaryOnly.takeHome / 26),
    semimonthly: round2(salaryOnly.takeHome / 24),
  };
}
