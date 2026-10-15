import { createClient } from '@supabase/supabase-js';

import type { CloudConfig } from '@/lib/cloud/config';
import { parseEnvelope, type Envelope } from '@/lib/cloud/crypto';

import type { EncryptedSessionStorage } from './session-store';
import type { Remote } from './vault';

/**
 * The ONLY module that talks to the network. It moves an email address (to
 * sign in) and the encrypted envelope — the same two things, through the
 * same service and the same row-level-secured table, as the web app's
 * lib/cloud/client.ts. It is never handed plaintext.
 *
 * Sign-in reuses an EXISTING account (created in the web app): no new
 * accounts are made from here.
 */

const SESSION_KEY = 'workoptional:session:v1';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s);

export function makeCloud(cfg: CloudConfig, storage: EncryptedSessionStorage) {
  const sb = createClient(cfg.url, cfg.anonKey, {
    auth: {
      storage,
      storageKey: SESSION_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  async function userId(): Promise<string | null> {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  }

  const remote: Remote = {
    async signedIn() {
      return (await userId()) !== null;
    },
    async fetch() {
      const { data, error } = await sb.from('vaults').select('envelope, updated_at').maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const envelope = parseEnvelope(data.envelope);
      if (!envelope || typeof data.updated_at !== 'string') throw new Error('unreadable vault');
      return { envelope, updatedAt: data.updated_at };
    },
    async save(envelope: Envelope, expected: string | null) {
      if (expected === null) {
        const { data, error } = await sb.from('vaults').insert({ envelope }).select('updated_at');
        if (error) {
          if (error.code === '23505') return { ok: false, reason: 'conflict' };
          throw error;
        }
        return { ok: true, updatedAt: data[0]!.updated_at as string };
      }
      const { data, error } = await sb
        .from('vaults')
        .update({ envelope })
        .eq('updated_at', expected)
        .select('updated_at');
      if (error) throw error;
      if (!data || data.length === 0) return { ok: false, reason: 'conflict' };
      return { ok: true, updatedAt: data[0]!.updated_at as string };
    },
  };

  return {
    remote,
    async email(): Promise<string | null> {
      const { data } = await sb.auth.getSession();
      return data.session?.user.email ?? null;
    },
    /** Email a sign-in link (or code, if the template carries one). */
    async startSignIn(email: string) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
    },
    /**
     * Finish with the 6–10 digit code from the email, or the sign-in link
     * itself (copied, not clicked — a clicked link is already used up).
     */
    async finishSignIn(email: string, codeOrLink: string) {
      const raw = codeOrLink.trim();
      const digits = raw.replace(/\s/g, '');
      if (/^\d{6,10}$/.test(digits)) {
        const { error } = await sb.auth.verifyOtp({ email, token: digits, type: 'email' });
        if (error) throw error;
        return;
      }
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        throw new Error('not a code or a link');
      }
      // Only links that point at the configured sync service.
      if (url.origin !== cfg.url) throw new Error('link is not from the sync service');
      const tokenHash = url.searchParams.get('token') ?? url.searchParams.get('token_hash');
      if (!tokenHash) throw new Error('link has no token');
      const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (error) throw error;
    },
    async signOut() {
      await sb.auth.signOut();
    },
  };
}

export type Cloud = ReturnType<typeof makeCloud>;
