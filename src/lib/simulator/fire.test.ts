import { describe, expect, it } from 'vitest';

import type { YearRow } from './engine';
import { computeFire, type FireOptions } from './fire';

/** Minimal YearRow where only year + real net worth matter to computeFire. */
function row(year: number, realNetWorth: number): YearRow {
  return {
    year,
    ages: {},
    grossIncome: 0,
    afterTaxIncome: 0,
    expenses: 0,
    windfalls: 0,
    saved: 0,
    investmentGrowth: 0,
    investedBalance: realNetWorth,
    netWorth: realNetWorth,
    netWorthRealTodayDollars: realNetWorth,
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

  it('without a person, full/lean still compute (age null) and coast is skipped', () => {
    const rows = [row(2026, 1_200_000)];
    const r = computeFire(rows, { ...base, primaryBirthYear: null });
    expect(r.full.reached).toBe(true);
    expect(r.full.age).toBeNull();
    expect(r.coast.reached).toBe(false);
  });
});
