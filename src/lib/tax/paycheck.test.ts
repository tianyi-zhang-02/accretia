import { describe, expect, it } from 'vitest';

import { bracketTax, paycheck, type PaycheckInput } from './paycheck';

const base: PaycheckInput = {
  salary: 0,
  bonus: 0,
  filing: 'single',
  state: 'TX',
  stateRatePct: 0,
  cityRatePct: 0,
  k401: 0,
  age50Plus: false,
  hsa: 0,
  otherPretax: 0,
};

// Every expected figure below is worked by hand from the published tables
// (IRS Rev. Proc. 2025-32; SSA 2026 wage base; FTB 2025 schedules; EDD 2026).

describe('federal brackets (2026)', () => {
  it('matches the IRS table at bracket edges', () => {
    const single = [
      [12_400, 0.1],
      [50_400, 0.12],
      [105_700, 0.22],
      [201_775, 0.24],
      [256_225, 0.32],
      [640_600, 0.35],
      [Infinity, 0.37],
    ] as const;
    // "The tax is" column of Table 3.
    expect(bracketTax(12_400, single)).toBe(1_240);
    expect(bracketTax(50_400, single)).toBe(5_800);
    expect(bracketTax(105_700, single)).toBe(17_966);
    expect(bracketTax(201_775, single)).toBe(41_024);
    expect(bracketTax(256_225, single)).toBe(58_448);
    expect(bracketTax(640_600, single)).toBe(192_979.25);
  });
});

describe('paycheck', () => {
  it('single, $200k salary, Texas', () => {
    const p = paycheck({ ...base, salary: 200_000 });
    // 200,000 − 16,100 = 183,900 → 17,966 + 24% × 78,200 = 36,734
    expect(p.federalTaxable).toBe(183_900);
    expect(p.federal).toBe(36_734);
    expect(p.socialSecurity).toBe(11_439); // 6.2% × 184,500
    expect(p.medicare).toBe(2_900); // 1.45% × 200,000, no additional
    expect(p.state).toBe(0);
    expect(p.totalTax).toBe(51_073);
    expect(p.takeHome).toBe(148_927);
    expect(p.monthly).toBeCloseTo(148_927 / 12, 2);
  });

  it('the sheet’s example: $200k salary + $300k bonus — bonus nets its marginal share', () => {
    const p = paycheck({ ...base, salary: 200_000, bonus: 300_000 });
    // 483,900 taxable → 58,448 + 35% × 227,675 = 138,134.25
    expect(p.federal).toBe(138_134.25);
    // Medicare 1.45% × 500,000 + 0.9% × 300,000 = 7,250 + 2,700
    expect(p.medicare).toBe(9_950);
    expect(p.socialSecurity).toBe(11_439);
    expect(p.totalTax).toBe(159_523.25);
    expect(p.bonusTax).toBe(108_450.25); // 159,523.25 − 51,073
    expect(p.bonusTakeHome).toBe(191_549.75);
    expect(p.takeHome).toBe(p.salaryOnly.takeHome + p.bonusTakeHome);
  });

  it('California: brackets, exemption credit, SDI on gross', () => {
    const p = paycheck({ ...base, salary: 200_000, state: 'CA' });
    // 200,000 − 5,706 = 194,294 → 3,201.97 + 9.3% × 121,570 = 14,507.98; − 153
    expect(p.state).toBe(14_354.98);
    expect(p.stateExact).toBe(true);
    expect(p.sdi).toBe(2_600); // 1.3% × 200,000, no cap
  });

  it('401(k): lowers income taxes, not FICA; capped at the 2026 limit', () => {
    const p = paycheck({ ...base, salary: 200_000, k401: 30_000 });
    expect(p.k401).toBe(24_500);
    expect(p.k401Capped).toBe(true);
    // 200,000 − 24,500 − 16,100 = 159,400 → 17,966 + 24% × 53,700 = 30,854
    expect(p.federal).toBe(30_854);
    expect(p.socialSecurity).toBe(11_439);
    expect(p.medicare).toBe(2_900);
    expect(p.takeHome).toBe(200_000 - 24_500 - (30_854 + 11_439 + 2_900));

    const older = paycheck({ ...base, salary: 200_000, k401: 30_000, age50Plus: true });
    expect(older.k401).toBe(30_000);
    expect(older.k401Capped).toBe(false);
  });

  it('HSA lowers FICA and federal tax, but California adds it back', () => {
    const tx = paycheck({ ...base, salary: 100_000, hsa: 4_000 });
    expect(tx.medicare).toBe(1_392); // 1.45% × 96,000
    expect(tx.socialSecurity).toBe(5_952); // 6.2% × 96,000
    const ca = paycheck({ ...base, salary: 100_000, hsa: 4_000, state: 'CA' });
    const caNoHsa = paycheck({ ...base, salary: 100_000, state: 'CA' });
    expect(ca.state).toBe(caNoHsa.state);
  });

  it('married filing jointly: wider brackets, Additional Medicare from $250k', () => {
    const p = paycheck({ ...base, salary: 300_000, filing: 'mfj' });
    // 300,000 − 32,200 = 267,800 → 35,932 + 24% × 56,400 = 49,468
    expect(p.federal).toBe(49_468);
    // 1.45% × 300,000 + 0.9% × 50,000 = 4,350 + 450
    expect(p.medicare).toBe(4_800);
  });

  it('other states: an editable flat estimate, labelled as such; city tax on top', () => {
    const p = paycheck({
      ...base,
      salary: 150_000,
      state: 'NY',
      stateRatePct: 6,
      cityRatePct: 3.876,
    });
    expect(p.stateExact).toBe(false);
    expect(p.state).toBe(9_000);
    expect(p.city).toBe(5_814);
    expect(paycheck({ ...base, salary: 150_000, state: 'WA' }).state).toBe(0);
  });

  it('degenerate inputs stay sane', () => {
    const zero = paycheck(base);
    expect(zero.takeHome).toBe(0);
    expect(zero.effectiveTaxPct).toBe(0);
    const neg = paycheck({ ...base, salary: -5, k401: -1, hsa: -1 });
    expect(neg.gross).toBe(0);
    expect(neg.totalTax).toBe(0);
  });
});
