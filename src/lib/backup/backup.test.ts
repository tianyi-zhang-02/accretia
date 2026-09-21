import { describe, expect, it } from 'vitest';

import type { Assumptions } from '@/lib/validation/scenarios';

import { backupFilename, buildBackup, daysSince, parseBackup } from './backup';

const assumptions: Assumptions = {
  horizonStartYear: 2026,
  horizonEndYear: 2056,
  people: [{ id: 'p', name: 'You', birthYear: 1996, careerStages: [] }],
  startingNetWorth: 100_000,
  startingInvested: 80_000,
  effectiveTaxRatePct: 30,
  investment: { returnPct: 6, returnPctLow: 3, returnPctHigh: 9 },
  inflationPct: 3,
  windfalls: [],
  majorExpenses: [],
  recurringAnnualExpenses: 60_000,
};
const scenarios = [
  { id: 'a', name: 'Base', assumptions },
  { id: 'b', name: 'Lean', assumptions: { ...assumptions, recurringAnnualExpenses: 40_000 } },
];
const ledger = [{ year: 2026, month: 1, income: 9000, spending: 5000, netWorth: 100_000 }];
const when = new Date('2026-09-21T12:00:00Z');

describe('backup round trip', () => {
  it('restores everything it wrote — scenarios, selection and ledger', () => {
    const text = JSON.stringify(buildBackup(scenarios, 'b', ledger, when));
    const r = parseBackup(text);
    if (!r.ok) throw new Error('expected ok');
    expect(r.scenarios).toEqual(scenarios);
    expect(r.selectedId).toBe('b');
    expect(r.ledger).toEqual(ledger);
    expect(r.droppedScenarios).toBe(0);
    expect(r.exportedAt).toBe('2026-09-21T12:00:00.000Z');
  });

  it('names the file by date so backups sort and never overwrite silently', () => {
    expect(backupFilename(when)).toBe('work-optional-backup-2026-09-21.json');
  });
});

describe('restore treats the file as untrusted', () => {
  const good = () => buildBackup(scenarios, 'a', ledger, when);

  it('rejects oversize, non-JSON, and files from other apps', () => {
    expect(parseBackup('x'.repeat(2_000_001))).toEqual({ ok: false, reason: 'tooLarge' });
    expect(parseBackup('{nope')).toEqual({ ok: false, reason: 'notJson' });
    expect(parseBackup('[]')).toEqual({ ok: false, reason: 'notBackup' });
    expect(parseBackup(JSON.stringify({ ...good(), app: 'something-else' }))).toEqual({
      ok: false,
      reason: 'notBackup',
    });
  });

  it('refuses a newer format instead of silently dropping its fields', () => {
    expect(parseBackup(JSON.stringify({ ...good(), version: 2 }))).toEqual({
      ok: false,
      reason: 'newerVersion',
    });
  });

  it('drops invalid scenarios, keeps the valid ones, and says how many', () => {
    const tampered = {
      ...good(),
      scenarios: [
        scenarios[0],
        { id: 'x', name: 'Bad', assumptions: { ...assumptions, startingNetWorth: 'lots' } },
        { id: 'y', name: 'Inf', assumptions: { ...assumptions, inflationPct: 1e9 } },
      ],
    };
    const r = parseBackup(JSON.stringify(tampered));
    if (!r.ok) throw new Error('expected ok');
    expect(r.scenarios.map((s) => s.id)).toEqual(['a']);
    expect(r.droppedScenarios).toBe(2);
  });

  it('is a failure, not an empty app, when no scenario survives', () => {
    const r = parseBackup(
      JSON.stringify({ ...good(), scenarios: [{ id: 'x', name: 'n', assumptions: {} }] }),
    );
    expect(r).toEqual({ ok: false, reason: 'empty' });
  });

  it('a corrupt ledger costs the ledger, not the plans', () => {
    const r = parseBackup(JSON.stringify({ ...good(), ledger: [{ year: 2026, month: 99 }] }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.scenarios).toHaveLength(2);
    expect(r.ledger).toEqual([]);
  });

  it('falls back to the first scenario when the selection points nowhere', () => {
    const r = parseBackup(JSON.stringify({ ...good(), selectedId: 'ghost' }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.selectedId).toBe('a');
  });

  it('caps scenario names and count', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `s${i}`,
      name: 'n'.repeat(200),
      assumptions,
    }));
    const r = parseBackup(JSON.stringify({ ...good(), scenarios: many }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.scenarios).toHaveLength(50);
    expect(r.scenarios[0]!.name).toHaveLength(80);
  });
});

describe('daysSince', () => {
  it('counts whole days and tolerates junk', () => {
    expect(daysSince('2026-09-01T12:00:00Z', when)).toBe(20);
    expect(daysSince('2026-09-21T11:00:00Z', when)).toBe(0);
    expect(daysSince(null, when)).toBeNull();
    expect(daysSince('not a date', when)).toBeNull();
    expect(daysSince('2030-01-01T00:00:00Z', when)).toBe(0); // clock skew never goes negative
  });
});
