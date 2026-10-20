import { describe, expect, it } from 'vitest';

import type { YearRow } from './engine';
import { computeFire, type FireOptions } from './fire';

/** Minimal YearRow where only year + real net worth (+ home equity) matter. */
function row(year: number, realNetWorth: number, homeEquityReal = 0, mortgageBalance = 0): YearRow {
  return {
    year,
    ages: {},
    grossIncome: 0,
    afterTaxIncome: 0,
    expenses: 0,
    windfalls: 0,
    saved: 0,
    investmentGrowth: 0,
    investedBalance: realNetWorth - homeEquityReal,
    netWorth: realNetWorth,
    netWorthRealTodayDollars: realNetWorth,
    homeEquityRealTodayDollars: homeEquityReal,
    housingCosts: 0,
    mortgageBalance,
  };
}

const base: FireOptions = {
  recurringAnnualExpenses: 40_000,
  safeWithdrawalRatePct: 4,
  annualHealthInsurance: 0,
  essentialAnnualExpenses: 40_000,
  returnPct: 7,
  inflationPct: 3,
  primaryBirthYear: 1996,
};

describe('computeFire', () => {
  it('full FIRE number is 25× spend at 4%, reached the first qualifying year', () => {
    const rows = [row(2026, 500_000), row(2027, 900_000), row(2028, 1_050_000)];
    const r = computeFire(rows, base);
    expect(r.full.number).toBe(1_000_000); // 40k / 0.04
    expect(r.full.reached).toBe(true);
    expect(r.full.year).toBe(2028);
    expect(r.full.age).toBe(2028 - 1996); // 32
  });

  it('lean FIRE (lower essential spend) is reached earlier than full', () => {
    const rows = [row(2026, 500_000), row(2027, 650_000), row(2028, 1_050_000)];
    const r = computeFire(rows, { ...base, essentialAnnualExpenses: 24_000 });
    expect(r.lean.number).toBe(600_000); // 24k / 0.04
    expect(r.lean.year).toBe(2027);
    expect(r.full.year).toBe(2028);
  });

  it('health-insurance reserve raises the number and can push it out of reach', () => {
    const rows = [row(2026, 500_000), row(2027, 900_000), row(2028, 1_050_000)];
    const r = computeFire(rows, { ...base, annualHealthInsurance: 10_000 });
    expect(r.fullSpend).toBe(50_000);
    expect(r.full.number).toBe(1_250_000); // 50k / 0.04
    expect(r.full.reached).toBe(false); // max row is 1.05M
    expect(r.full.year).toBeNull();
  });

  it('coast FIRE: a smaller balance today counts if it can compound to the number by retirement', () => {
    // Full number = 1,000,000; realReturn ≈ (1.07/1.03 − 1) ≈ 3.88%/yr.
    // At age 30 (2026), 35 yrs of compounding needs only ~$264k today.
    const rows = [row(2026, 300_000), row(2027, 320_000)];
    const r = computeFire(rows, base);
    expect(r.coast.reached).toBe(true);
    expect(r.coast.year).toBe(2026);
    expect(r.coast.age).toBe(30);
    expect(r.coast.number).toBeGreaterThan(200_000);
    expect(r.coast.number).toBeLessThan(r.full.number); // coasting needs less than full
  });

  it('home equity does NOT count toward FIRE — only investable net worth does', () => {
    // Real net worth 1.2M looks past the 1M number, but 500k of it is the
    // house. Investable = 700k → not FIRE'd. Same total without the house is.
    const withHome = [row(2026, 1_200_000, 500_000)];
    const noHome = [row(2026, 1_200_000)];
    expect(computeFire(withHome, base).full.reached).toBe(false);
    expect(computeFire(noHome, base).full.reached).toBe(true);
  });

  it('without a person, full/lean still compute (age null) and coast is skipped', () => {
    const rows = [row(2026, 1_200_000)];
    const r = computeFire(rows, { ...base, primaryBirthYear: null });
    expect(r.full.reached).toBe(true);
    expect(r.full.age).toBeNull();
    expect(r.coast.reached).toBe(false);
  });
});

describe('computeFire with a home', () => {
  const home = { purchaseYear: 2026, propertyTaxPct: 1, maintenancePct: 1 };

  it('no inflation: (spend + tax & upkeep) ÷ SWR + the mortgage still owed', () => {
    // Home worth 300k equity + 400k loan = 700k; 2% of it = 14k a year.
    // Target = (40k + 14k) / 0.04 + 400k = 1,350,000 + 400,000 = 1,750,000.
    const opts = { ...base, inflationPct: 0, horizonStartYear: 2026, home };
    const rows = [row(2026, 2_000_000, 300_000, 400_000)]; // investable 1.7M
    const r = computeFire(rows, opts);
    expect(r.full.number).toBeCloseTo(1_750_000, 6);
    expect(r.full.reached).toBe(false); // 1.7M < 1.75M
    // Without the home's costs the same 1.7M would have been "FIRE" (1M target).
    expect(computeFire(rows, { ...base, inflationPct: 0 }).full.reached).toBe(true);
  });

  it('with inflation, rebuilt exactly as the engine deflates (hand-worked)', () => {
    // Row 2027 of a plan starting 2026 at 3%: F = 1.03^2 = 1.0609.
    //   value   = 300,000 × 1.0609 + 400,000          = 718,270
    //   carrying = 718,270 × 2% / (1.0609 × 1.03)       = 13,146.376
    //   mortgage = 400,000 / 1.0609                     = 377,038.364
    //   target   = (40,000 + 13,146.376) / 0.04 + 377,038.364 = 1,705,697.763
    const opts = { ...base, horizonStartYear: 2026, home };
    const r = computeFire([row(2027, 0, 300_000, 400_000)], opts);
    expect(r.full.number).toBeCloseTo(1_705_697.763, 2);
  });

  it('a home bought later counts before it is bought (at its purchase-year figures)', () => {
    // No inflation; bought in 2027 (300k equity + 400k loan → 14k/yr, 400k owed).
    const opts = {
      ...base,
      inflationPct: 0,
      horizonStartYear: 2026,
      home: { ...home, purchaseYear: 2027 },
    };
    const rows = [row(2026, 1_100_000), row(2027, 1_800_000, 300_000, 400_000)];
    const r = computeFire(rows, opts);
    // 1.1M investable in 2026 beats the 1M everyday number — but not the
    // 1.75M it takes once the house comes; nor does 2027's 1.5M.
    expect(r.full.reached).toBe(false);
    expect(r.full.number).toBeCloseTo(1_750_000, 6);
    expect(r.fullHome).toEqual({ carrying: 14_000, mortgage: 400_000 });
  });

  it('a purchase beyond the rows adds nothing', () => {
    const opts = { ...base, horizonStartYear: 2026, home: { ...home, purchaseYear: 2030 } };
    expect(computeFire([row(2027, 0, 0, 0)], opts).full.number).toBe(1_000_000);
  });

  it('a paid-off home still costs tax and upkeep for life', () => {
    // 500k home, no loan, 2% → 10k/yr → (40k + 10k) / 0.04 = 1,250,000.
    const opts = { ...base, inflationPct: 0, horizonStartYear: 2026, home };
    expect(computeFire([row(2026, 0, 500_000, 0)], opts).full.number).toBeCloseTo(1_250_000, 6);
  });

  it('before a later purchase, the down payment still to leave counts too', () => {
    // No inflation. 2026: 2.1M investable. 2027: buy 1M with 50% down
    // (500k equity + 500k loan; tax+upkeep 2% of 1M = 20k).
    // 2027 target = (40k + 20k)/0.04 + 500k = 2,000,000;
    // 2026 target = that + the 500k down payment = 2,500,000 → not FIRE yet.
    const opts = {
      ...base,
      inflationPct: 0,
      horizonStartYear: 2026,
      home: { ...home, purchaseYear: 2027, homePrice: 1_000_000, downPaymentPct: 50 },
    };
    const rows = [row(2026, 2_100_000), row(2027, 2_000_000, 500_000, 500_000)];
    const r = computeFire(rows, opts);
    expect(r.full.reached).toBe(false);
    expect(r.full.number).toBeCloseTo(2_500_000, 6);
  });
});
