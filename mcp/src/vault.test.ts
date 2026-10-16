import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildBackup, parseBackup } from '@/lib/backup/backup';
import { createVault, open, seal, unlock, type Envelope } from '@/lib/cloud/crypto';
import { defaultAssumptions } from '@/components/simulator/default-assumptions';

import {
  applyMonthEdit,
  clearMonthChange,
  logMonthChange,
  monthSummary,
  setAnnualChange,
  setGoalsChange,
  setBudgetsChange,
} from './edits';
import { Store } from './store';
import { Vault, VaultError, type Remote, type VaultData } from './vault';

const PASS = 'correct horse battery staple';
const T = 60_000; // real 600k-iteration PBKDF2 in places

/** An in-memory stand-in for the sync service, with the same concurrency rule. */
function fakeRemote() {
  const state: {
    row: { envelope: Envelope; updatedAt: string } | null;
    signedIn: boolean;
    online: boolean;
    n: number;
  } = { row: null, signedIn: true, online: true, n: 0 };
  // Lets a test slip in "another device's" write right before ours lands.
  let beforeSave: (() => Promise<void>) | null = null;
  const stamp = () => `2026-10-15T00:00:${String(++state.n).padStart(2, '0')}Z`;
  const remote: Remote = {
    async signedIn() {
      if (!state.online) throw new Error('offline');
      return state.signedIn;
    },
    async fetch() {
      if (!state.online) throw new Error('offline');
      return state.row ? { ...state.row } : null;
    },
    async save(envelope, expected) {
      if (!state.online) throw new Error('offline');
      if (beforeSave) {
        const f = beforeSave;
        beforeSave = null;
        await f();
      }
      if ((state.row?.updatedAt ?? null) !== expected) return { ok: false, reason: 'conflict' };
      state.row = { envelope, updatedAt: stamp() };
      return { ok: true, updatedAt: state.row.updatedAt };
    },
  };
  return { remote, state, setBeforeSave: (f: () => Promise<void>) => (beforeSave = f), stamp };
}

/** What the web app uploads: a backup, sealed with the vault's keys. */
async function webAppVault(ledger = [] as ReturnType<typeof applyMonthEdit>[]) {
  const { vault } = await createVault(PASS);
  const scenarios = [{ id: 'p1', name: 'Plan', assumptions: defaultAssumptions() }];
  const envelope = await seal(JSON.stringify(buildBackup(scenarios, 'p1', ledger)), vault);
  return { envelope, vault };
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-mcp-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('month edits', () => {
  it('merge changes only what is given; one total clears the parts', () => {
    const m = applyMonthEdit(undefined, {
      year: 2026,
      month: 9,
      incomeSources: { salary: 11_000 },
      lineItems: { 'housing.rent': 3_200, 'food.groceries': 600 },
    });
    expect(m).toMatchObject({ income: 11_000, spending: 3_800 });
    const m2 = applyMonthEdit(m, {
      year: 2026,
      month: 9,
      lineItems: { 'food.groceries': 650 },
      netWorth: 1,
    });
    expect(m2).toMatchObject({ income: 11_000, spending: 3_850, netWorth: 1 });
    const m3 = applyMonthEdit(m2, { year: 2026, month: 9, spending: 4_000 });
    expect(m3.categories).toBeUndefined();
    expect(m3.breakdown).toBeUndefined();
    expect(m3.spending).toBe(4_000);
    expect(applyMonthEdit(m3, { year: 2026, month: 9, netWorth: null }).netWorth).toBeUndefined();
    expect(applyMonthEdit(m3, { year: 2026, month: 9, income: 9_000, replace: true })).toEqual({
      year: 2026,
      month: 9,
      income: 9_000,
      spending: 0,
    });
  });
});

describe('local-only vault', () => {
  it(
    'creates an encrypted vault, writes the recovery code to a private file, never plaintext',
    async () => {
      const store = new Store(dir);
      const v = new Vault(store, PASS, null);
      const r = await v.update(
        logMonthChange({ year: 2026, month: 9, income: 12_345, spending: 6_789 }),
      );
      expect(r.recoveryCodeFile).toBe(path.join(dir, 'RECOVERY-CODE.txt'));
      const raw = fs.readFileSync(path.join(dir, 'vault.json'), 'utf8');
      expect(raw).not.toContain('12345');
      expect(raw).not.toContain('6789');
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(dir, 'vault.json')).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(dir, 'RECOVERY-CODE.txt')).mode & 0o777).toBe(0o600);

      // A fresh process with the same passphrase reads it back…
      const again = await new Vault(new Store(dir), PASS, null).read();
      expect(again.source).toBe('local');
      expect(again.data.ledger).toEqual([
        { year: 2026, month: 9, income: 12_345, spending: 6_789 },
      ]);
      // …and the recovery code opens it too.
      const code = fs
        .readFileSync(path.join(dir, 'RECOVERY-CODE.txt'), 'utf8')
        .match(/([A-Z2-7]{4}-){7}[A-Z2-7]{4}/)![0];
      const env = (JSON.parse(raw) as { envelope: Envelope }).envelope;
      expect(parseBackup(await open(env, await unlock(env, { recoveryCode: code }))).ok).toBe(true);
    },
    T,
  );

  it(
    'a wrong passphrase reads nothing and writes nothing',
    async () => {
      await new Vault(new Store(dir), PASS, null).update(
        logMonthChange({ year: 2026, month: 1, income: 1 }),
      );
      const before = fs.readFileSync(path.join(dir, 'vault.json'), 'utf8');
      const wrong = new Vault(new Store(dir), 'not the passphrase!!', null);
      await expect(wrong.read()).rejects.toMatchObject({ code: 'wrongPassphrase' });
      await expect(
        wrong.update(logMonthChange({ year: 2026, month: 2, income: 2 })),
      ).rejects.toBeInstanceOf(VaultError);
      expect(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8')).toBe(before);
    },
    T,
  );
});

describe('sync with the web app', () => {
  it(
    'reads what the web app uploaded, writes what the web app can read',
    async () => {
      const f = fakeRemote();
      const { envelope, vault: webKeys } = await webAppVault([
        applyMonthEdit(undefined, { year: 2026, month: 8, income: 10_000, spending: 4_000 }),
      ]);
      f.state.row = { envelope, updatedAt: f.stamp() };

      const v = new Vault(new Store(dir), PASS, f.remote);
      const r = await v.read();
      expect(r.source).toBe('cloud');
      expect(r.data.ledger).toHaveLength(1);

      await v.update(
        logMonthChange({ year: 2026, month: 9, income: 11_000, pretaxSavings: 1_958 }),
      );
      // The web app, with its own keys, opens the new cloud copy.
      const web = parseBackup(await open(f.state.row!.envelope, webKeys));
      expect(web.ok && web.ledger.map((e) => e.month)).toEqual([8, 9]);
      expect(web.ok && web.scenarios[0]!.id).toBe('p1'); // plans untouched
      // Ciphertext only on the wire and on disk.
      expect(JSON.stringify(f.state.row)).not.toContain('11000');
      expect(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8')).not.toContain('11000');
    },
    T,
  );

  it(
    'a write from another device in between: the one change is re-applied on top, nothing lost',
    async () => {
      const f = fakeRemote();
      const { envelope, vault: webKeys } = await webAppVault();
      f.state.row = { envelope, updatedAt: f.stamp() };
      const v = new Vault(new Store(dir), PASS, f.remote);

      f.setBeforeSave(async () => {
        // The phone logs August while Claude is logging September.
        const other = await seal(
          JSON.stringify(
            buildBackup([{ id: 'p1', name: 'Plan', assumptions: defaultAssumptions() }], 'p1', [
              applyMonthEdit(undefined, { year: 2026, month: 8, income: 5, spending: 1 }),
            ]),
          ),
          webKeys,
        );
        f.state.row = { envelope: other, updatedAt: f.stamp() };
      });
      await v.update(logMonthChange({ year: 2026, month: 9, income: 9 }));
      const web = parseBackup(await open(f.state.row!.envelope, webKeys));
      expect(web.ok && web.ledger.map((e) => e.month)).toEqual([8, 9]);
    },
    T,
  );

  it(
    'offline: reads fall back to this machine’s encrypted copy; writes are refused',
    async () => {
      const f = fakeRemote();
      const { envelope } = await webAppVault([
        applyMonthEdit(undefined, { year: 2026, month: 8, income: 10, spending: 1 }),
      ]);
      f.state.row = { envelope, updatedAt: f.stamp() };
      const v = new Vault(new Store(dir), PASS, f.remote);
      await v.read(); // caches
      f.state.online = false;
      const r = await v.read();
      expect(r.source).toBe('offline-copy');
      expect(r.data.ledger).toHaveLength(1);
      await expect(
        v.update(logMonthChange({ year: 2026, month: 9, income: 1 })),
      ).rejects.toMatchObject({
        code: 'offline',
      });
    },
    T,
  );

  it('signed out, or no cloud copy yet: says so, writes nothing', async () => {
    const f = fakeRemote();
    const v = new Vault(new Store(dir), PASS, f.remote);
    await expect(
      v.update(logMonthChange({ year: 2026, month: 9, income: 1 })),
    ).rejects.toMatchObject({
      code: 'noCloudVault',
    });
    f.state.signedIn = false;
    await expect(v.read()).rejects.toMatchObject({ code: 'signedOut' });
    expect(fs.existsSync(path.join(dir, 'vault.json'))).toBe(false);
  });

  it(
    'clearing a month removes only that month',
    async () => {
      const f = fakeRemote();
      const { envelope } = await webAppVault([
        applyMonthEdit(undefined, { year: 2026, month: 8, income: 1 }),
        applyMonthEdit(undefined, { year: 2026, month: 9, income: 2 }),
      ]);
      f.state.row = { envelope, updatedAt: f.stamp() };
      const v = new Vault(new Store(dir), PASS, f.remote);
      const { after } = await v.update(clearMonthChange(2026, 8));
      expect(after.ledger.map((e) => e.month)).toEqual([9]);
    },
    T,
  );
});

describe('budgets', () => {
  const data = (): VaultData => {
    const d = {
      scenarios: [
        { id: 'a', name: 'A', assumptions: defaultAssumptions() },
        {
          id: 'b',
          name: 'B',
          assumptions: { ...defaultAssumptions(), monthlyBudgets: { fun: 300 } },
        },
      ],
      selectedId: 'b',
      ledger: [],
    };
    return d as VaultData;
  };

  it('merge into the selected plan only; 0 removes; replace starts over', () => {
    const d1 = setBudgetsChange({ food: 800, fun: 0 })(data());
    expect(d1.scenarios[1]!.assumptions.monthlyBudgets).toEqual({ food: 800 });
    expect(d1.scenarios[0]!.assumptions.monthlyBudgets).toBeUndefined();
    const d2 = setBudgetsChange({ health: 100 }, true)(d1);
    expect(d2.scenarios[1]!.assumptions.monthlyBudgets).toEqual({ health: 100 });
  });

  it('the month summary says which categories went over', () => {
    const m = applyMonthEdit(undefined, {
      year: 2026,
      month: 9,
      income: 9_000,
      categories: { food: 950, fun: 100 },
    });
    expect(monthSummary(m, { food: 800, fun: 300 }).budgets).toEqual([
      { category: 'food', budget: 800, spent: 950, left: -150, over: true },
      { category: 'fun', budget: 300, spent: 100, left: 200, over: false },
    ]);
    expect(monthSummary(m).budgets).toBeUndefined();
  });
});

describe('once-a-year bills', () => {
  it('replace the selected plan’s list, validated like the web app', () => {
    const d = {
      scenarios: [{ id: 'a', name: 'A', assumptions: defaultAssumptions() }],
      selectedId: 'a',
      ledger: [],
    } as VaultData;
    const bills = [{ item: 'insurance.auto' as const, amount: 1_200, month: 11 }];
    expect(setAnnualChange(bills)(d).scenarios[0]!.assumptions.annualExpenses).toEqual(bills);
    expect(setAnnualChange([])(d).scenarios[0]!.assumptions.annualExpenses).toEqual([]);
    expect(() => setAnnualChange([{ item: 'insurance.auto', amount: 1, month: 13 }])(d)).toThrow();
  });
});

describe('savings goals', () => {
  it('replace the selected plan’s goals, validated like the web app', () => {
    const d = {
      scenarios: [{ id: 'a', name: 'A', assumptions: defaultAssumptions() }],
      selectedId: 'a',
      ledger: [],
    } as VaultData;
    const goals = [
      { kind: 'downPayment' as const, target: 100_000, saved: 40_000, year: 2028, month: 6 },
    ];
    expect(setGoalsChange(goals)(d).scenarios[0]!.assumptions.savingsGoals).toEqual(goals);
    expect(() => setGoalsChange([{ ...goals[0]!, kind: 'yacht' as 'car' }])(d)).toThrow();
  });
});
