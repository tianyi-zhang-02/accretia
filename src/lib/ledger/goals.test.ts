import { describe, expect, it } from 'vitest';

import { goalStatus, goalsSummary, suggestEmergency, type SavingsGoal } from './goals';
import type { MonthEntry } from './ledger';

const oct = { year: 2026, month: 10 };
const goal = (x: Partial<SavingsGoal>): SavingsGoal => ({
  kind: 'downPayment',
  target: 100_000,
  saved: 40_000,
  year: 2027,
  month: 9,
  ...x,
});
const month = (m: number, income: number, spending: number): MonthEntry => ({
  year: 2026,
  month: m,
  income,
  spending,
});

describe('goalStatus', () => {
  it('what is left, the months left (both ends counted) and what it needs a month', () => {
    // Oct 2026 → Sep 2027 = 12 months; 60,000 left → 5,000 a month
    expect(goalStatus(goal({}), oct)).toEqual({
      left: 60_000,
      monthsLeft: 12,
      perMonth: 5_000,
      pct: 40,
      done: false,
      overdue: false,
    });
  });

  it('done once saved reaches the target; overdue after the deadline month', () => {
    expect(goalStatus(goal({ saved: 120_000 }), oct)).toMatchObject({
      done: true,
      perMonth: 0,
      pct: 100,
    });
    expect(goalStatus(goal({ year: 2026, month: 9 }), oct)).toMatchObject({
      overdue: true,
      monthsLeft: 0,
      perMonth: 60_000,
    });
    // the deadline month itself still counts
    expect(goalStatus(goal({ year: 2026, month: 10 }), oct).monthsLeft).toBe(1);
  });
});

describe('goalsSummary', () => {
  it('all open goals together against what has been kept lately', () => {
    const s = goalsSummary(
      [
        goal({}), // 5,000 a month
        goal({ kind: 'emergency', target: 30_000, saved: 24_000, year: 2027, month: 3 }), // 6,000 / 6
        goal({ kind: 'car', saved: 100_000 }), // done → not counted
      ],
      [month(8, 12_000, 5_000), month(9, 12_000, 6_000), month(10, 12_000, 4_000)],
      oct,
    );
    expect(s).toEqual({ needPerMonth: 6_000, overdueLeft: 0, keptPerMonth: 7_000, room: 1_000 });
  });

  it('a goal past its date is not in the monthly need, but its gap is reported', () => {
    const late = goal({ year: 2026, month: 9 });
    const s = goalsSummary([late], [], oct);
    expect(s.needPerMonth).toBe(0);
    expect(s.overdueLeft).toBe(goalStatus(late, oct).left);
    expect(s.overdueLeft).toBeGreaterThan(0);
  });

  it('nothing logged → the need alone', () => {
    expect(goalsSummary([goal({})], [], oct)).toEqual({
      needPerMonth: 5_000,
      overdueLeft: 0,
      keptPerMonth: null,
      room: null,
    });
  });
});

it('an emergency fund suggestion: six months of recent spending', () => {
  expect(suggestEmergency([month(9, 1, 4_130), month(10, 1, 4_270)], oct)).toBe(25_200);
  expect(suggestEmergency([], oct)).toBeNull();
});

it('a goal without a target is not "reached"', () => {
  const s = goalStatus(goal({ target: 0, saved: 0 }), oct);
  expect(s.done).toBe(false);
  expect(s.perMonth).toBe(0);
});
