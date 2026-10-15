import { decrypt, deriveKey, encrypt, newSalt, parseEnvelope } from '@/lib/cloud/crypto';

import type { Store } from './store';

/**
 * Where the sync SIGN-IN (not the data) is kept between runs: the session
 * tokens, encrypted with a key derived from the passphrase, in session.json.
 * Plugged into supabase-js as its storage, so it handles refresh itself.
 * Without the passphrase the file is unreadable; a wrong passphrase simply
 * means "signed out".
 */
export class EncryptedSessionStorage {
  private key: Promise<{ key: CryptoKey; salt: string }> | null = null;
  private cache = new Map<string, string>();
  private loaded = false;

  constructor(
    private store: Store,
    private passphrase: string,
  ) {}

  private keyFor(salt?: string) {
    if (!this.key) {
      const s = salt ?? newSalt();
      this.key = deriveKey(this.passphrase, s).then((key) => ({ key, salt: s }));
    }
    return this.key;
  }

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    const raw = this.store.readJson('session.json') as {
      salt?: unknown;
      envelope?: unknown;
    } | null;
    const env = parseEnvelope(raw?.envelope);
    if (!raw || typeof raw.salt !== 'string' || !env) return;
    try {
      const { key } = await this.keyFor(raw.salt);
      const items = JSON.parse(await decrypt(env, key)) as Record<string, string>;
      for (const [k, v] of Object.entries(items)) if (typeof v === 'string') this.cache.set(k, v);
    } catch {
      // Wrong passphrase or damaged file: start signed out.
      this.key = null;
    }
  }

  private async save() {
    if (this.cache.size === 0) return this.store.remove('session.json');
    const { key, salt } = await this.keyFor();
    const envelope = await encrypt(JSON.stringify(Object.fromEntries(this.cache)), key, salt);
    this.store.writeJson('session.json', { salt, envelope });
  }

  async getItem(k: string): Promise<string | null> {
    await this.load();
    return this.cache.get(k) ?? null;
  }
  async setItem(k: string, v: string): Promise<void> {
    await this.load();
    this.cache.set(k, v);
    await this.save();
  }
  async removeItem(k: string): Promise<void> {
    await this.load();
    this.cache.delete(k);
    await this.save();
  }
}
