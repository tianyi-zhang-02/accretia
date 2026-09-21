/**
 * Whole-app backup — every scenario plus the monthly ledger in ONE file.
 *
 * This is what makes the app safe to use for years. Browser storage is not
 * a vault: clearing site data, switching machines, or Safari's seven-day
 * eviction all silently erase it. A backup file the user owns is the only
 * durable copy a no-backend app can offer, so it has to be one click.
 *
 * A restored file is untrusted input like any other import: size-capped,
 * shape-checked, every scenario through `assumptionsSchema`, the ledger
 * through `ledgerSchema`. Anything that fails is dropped and counted, never
 * guessed at.
 */

import { ledgerSchema, type MonthEntry } from '@/lib/ledger/ledger';
import { assumptionsSchema, type Assumptions } from '@/lib/validation/scenarios';

export const BACKUP_APP = 'work-optional';
export const BACKUP_VERSION = 1;
const MAX_BYTES = 2_000_000;
const MAX_SCENARIOS = 50;

export type BackupScenario = { id: string; name: string; assumptions: Assumptions };

export type Backup = {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  selectedId: string | null;
  scenarios: BackupScenario[];
  ledger: MonthEntry[];
};

export function buildBackup(
  scenarios: BackupScenario[],
  selectedId: string | null,
  ledger: MonthEntry[],
  now: Date = new Date(),
): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    selectedId,
    scenarios,
    ledger,
  };
}

export function backupFilename(now: Date = new Date()): string {
  return `work-optional-backup-${now.toISOString().slice(0, 10)}.json`;
}

export type RestoreResult =
  | { ok: false; reason: 'tooLarge' | 'notJson' | 'notBackup' | 'newerVersion' | 'empty' }
  | {
      ok: true;
      scenarios: BackupScenario[];
      selectedId: string;
      ledger: MonthEntry[];
      /** Scenarios present in the file but rejected by the schema. */
      droppedScenarios: number;
      exportedAt: string | null;
    };

export function parseBackup(text: string): RestoreResult {
  if (text.length > MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notJson' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'notBackup' };
  const b = raw as Record<string, unknown>;
  if (b.app !== BACKUP_APP || !Array.isArray(b.scenarios))
    return { ok: false, reason: 'notBackup' };
  // A file written by a newer app may carry fields this build would silently
  // drop on the next save — refuse rather than quietly lose data.
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    return { ok: false, reason: 'newerVersion' };
  }

  const scenarios: BackupScenario[] = [];
  let dropped = 0;
  for (const s of b.scenarios.slice(0, MAX_SCENARIOS)) {
    const c = s as { id?: unknown; name?: unknown; assumptions?: unknown };
    const a = assumptionsSchema.safeParse(c?.assumptions);
    if (a.success && typeof c.id === 'string' && c.id.length <= 80 && typeof c.name === 'string') {
      scenarios.push({ id: c.id, name: c.name.slice(0, 80), assumptions: a.data });
    } else dropped += 1;
  }
  if (scenarios.length === 0) return { ok: false, reason: 'empty' };

  const ledger = ledgerSchema.safeParse(b.ledger);
  const selectedId =
    typeof b.selectedId === 'string' && scenarios.some((s) => s.id === b.selectedId)
      ? b.selectedId
      : scenarios[0]!.id;

  return {
    ok: true,
    scenarios,
    selectedId,
    ledger: ledger.success ? ledger.data : [],
    droppedScenarios: dropped,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt.slice(0, 40) : null,
  };
}

/** Whole days since an ISO timestamp, or null if there isn't a usable one. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Nag threshold: a month without a backup is long enough to hurt. */
export const BACKUP_STALE_DAYS = 30;
