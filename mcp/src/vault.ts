import { buildBackup, parseBackup, type BackupScenario } from '@/lib/backup/backup';
import {
  createVault,
  open,
  parseEnvelope,
  seal,
  unlock,
  WrongPassphraseError,
  type Envelope,
  type VaultKeys,
} from '@/lib/cloud/crypto';
import { defaultAssumptions, newId } from '@/components/simulator/default-assumptions';
import type { MonthEntry } from '@/lib/ledger/ledger';

import type { Store } from './store';

/**
 * The vault: everything the app holds (plans + ledger), as ONE encrypted
 * envelope — byte-for-byte the format the web app uploads, so this server is
 * simply another device on the same end-to-end-encrypted account.
 *
 * Two modes:
 *  - SYNC: the account's cloud copy is the source of truth. Every write is
 *    read-latest → apply ONE change → upload with optimistic concurrency
 *    (`expected` = the version read). If someone else wrote in between, the
 *    change is re-applied to their version — it's a single month, never a
 *    merge of two whole datasets. A local encrypted copy is kept for reading
 *    offline; writing offline is refused rather than risking a fork.
 *  - LOCAL: no sync configured; the encrypted file is the only copy.
 *
 * The passphrase and keys stay in memory. Nothing in plaintext is written.
 */

export type VaultData = { scenarios: BackupScenario[]; selectedId: string; ledger: MonthEntry[] };
export type RemoteVault = { envelope: Envelope; updatedAt: string };

/** The cloud side, injected (see cloud.ts) so this file never touches the network. */
export type Remote = {
  signedIn(): Promise<boolean>;
  fetch(): Promise<RemoteVault | null>;
  save(
    envelope: Envelope,
    expected: string | null,
  ): Promise<{ ok: true; updatedAt: string } | { ok: false; reason: 'conflict' }>;
};

export type VaultErrorCode =
  | 'noPassphrase'
  | 'wrongPassphrase'
  | 'signedOut'
  | 'noCloudVault'
  | 'offline'
  | 'conflict'
  | 'unreadable';

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode) {
    super(code);
    this.name = 'VaultError';
  }
}

type Cache = { v: 1; envelope: Envelope; remoteUpdatedAt: string | null; savedAt: string };

export type ReadResult = {
  data: VaultData;
  /** Where it came from: the cloud (fresh), this machine's copy, or nothing yet. */
  source: 'cloud' | 'local' | 'offline-copy' | 'empty';
  updatedAt: string | null;
};

const MAX_ATTEMPTS = 3;

function emptyData(): VaultData {
  const id = newId();
  return {
    scenarios: [{ id, name: 'Plan 1', assumptions: defaultAssumptions() }],
    selectedId: id,
    ledger: [],
  };
}

export class Vault {
  private keys: { id: string; keys: VaultKeys } | null = null;

  constructor(
    private store: Store,
    private passphrase: string,
    private remote: Remote | null,
  ) {}

  get mode(): 'sync' | 'local' {
    return this.remote ? 'sync' : 'local';
  }

  /** Same envelope → same key; unlocking is slow on purpose, so remember it. */
  private keyId(env: Envelope): string {
    return env.v === 2 ? `2:${env.keys.pass.salt}:${env.keys.pass.k}` : `1:${env.salt}:${env.iter}`;
  }

  private async keysFor(env: Envelope): Promise<VaultKeys> {
    const id = this.keyId(env);
    if (this.keys?.id === id) return this.keys.keys;
    try {
      const keys = await unlock(env, { passphrase: this.passphrase });
      this.keys = { id, keys };
      return keys;
    } catch (e) {
      if (e instanceof WrongPassphraseError) throw new VaultError('wrongPassphrase');
      throw e;
    }
  }

  private async decode(env: Envelope): Promise<VaultData> {
    const keys = await this.keysFor(env);
    let text: string;
    try {
      text = await open(env, keys);
    } catch {
      throw new VaultError('wrongPassphrase');
    }
    const r = parseBackup(text);
    if (!r.ok) throw new VaultError('unreadable');
    return { scenarios: r.scenarios, selectedId: r.selectedId, ledger: r.ledger };
  }

  private async encode(data: VaultData, keys: VaultKeys): Promise<Envelope> {
    return seal(JSON.stringify(buildBackup(data.scenarios, data.selectedId, data.ledger)), keys);
  }

  private readCache(): Cache | null {
    const raw = this.store.readJson('vault.json') as Partial<Cache> | null;
    const envelope = parseEnvelope(raw?.envelope);
    if (!raw || !envelope) return null;
    return {
      v: 1,
      envelope,
      remoteUpdatedAt: typeof raw.remoteUpdatedAt === 'string' ? raw.remoteUpdatedAt : null,
      savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    };
  }

  private writeCache(envelope: Envelope, remoteUpdatedAt: string | null) {
    const c: Cache = { v: 1, envelope, remoteUpdatedAt, savedAt: new Date().toISOString() };
    this.store.writeJson('vault.json', c);
  }

  private async fetchRemote(): Promise<RemoteVault | null> {
    const remote = this.remote!;
    let signedIn: boolean;
    try {
      signedIn = await remote.signedIn();
    } catch {
      throw new VaultError('offline');
    }
    if (!signedIn) throw new VaultError('signedOut');
    try {
      return await remote.fetch();
    } catch {
      throw new VaultError('offline');
    }
  }

  async read(): Promise<ReadResult> {
    if (this.remote) {
      try {
        const r = await this.fetchRemote();
        if (!r) return { data: emptyData(), source: 'empty', updatedAt: null };
        const data = await this.decode(r.envelope);
        this.writeCache(r.envelope, r.updatedAt);
        return { data, source: 'cloud', updatedAt: r.updatedAt };
      } catch (e) {
        // Can't reach the service: fall back to the last copy on this machine.
        if (e instanceof VaultError && e.code === 'offline') {
          const c = this.readCache();
          if (c)
            return {
              data: await this.decode(c.envelope),
              source: 'offline-copy',
              updatedAt: c.remoteUpdatedAt,
            };
        }
        throw e;
      }
    }
    const c = this.readCache();
    if (!c) return { data: emptyData(), source: 'empty', updatedAt: null };
    return { data: await this.decode(c.envelope), source: 'local', updatedAt: c.savedAt };
  }

  /**
   * Apply ONE change. `change` must be a pure function of the data it's
   * given — on a conflict it is re-run on the newer version.
   */
  async update(
    change: (d: VaultData) => VaultData,
  ): Promise<{ before: VaultData; after: VaultData; recoveryCodeFile?: string }> {
    if (this.remote) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const r = await this.fetchRemote();
        // Creating the cloud vault is the web app's job: that's where the
        // recovery code is shown and saved properly.
        if (!r) throw new VaultError('noCloudVault');
        const keys = await this.keysFor(r.envelope);
        const before = await this.decode(r.envelope);
        const after = change(before);
        const envelope = await this.encode(after, keys);
        let res: Awaited<ReturnType<Remote['save']>>;
        try {
          res = await this.remote.save(envelope, r.updatedAt);
        } catch {
          throw new VaultError('offline');
        }
        if (res.ok) {
          this.writeCache(envelope, res.updatedAt);
          return { before, after };
        }
        // Someone wrote in between: go again on top of their version.
      }
      throw new VaultError('conflict');
    }

    // Local-only.
    const c = this.readCache();
    if (c) {
      const keys = await this.keysFor(c.envelope);
      const before = await this.decode(c.envelope);
      const after = change(before);
      this.writeCache(await this.encode(after, keys), null);
      return { before, after };
    }
    // First write: create the vault. The recovery code goes into a file only
    // the user can read — never into the conversation.
    const { vault, recoveryCode } = await createVault(this.passphrase);
    this.store.write(
      'RECOVERY-CODE.txt',
      `Work Optional — recovery code for the vault on this computer\n\n${recoveryCode}\n\nIt opens the vault if you forget the passphrase. Move it somewhere safe (a password manager), then delete this file.\n`,
    );
    const before = emptyData();
    const after = change(before);
    const envelope = await this.encode(after, vault);
    this.keys = { id: this.keyId(envelope), keys: vault };
    this.writeCache(envelope, null);
    return { before, after, recoveryCodeFile: this.store.path('RECOVERY-CODE.txt') };
  }
}
