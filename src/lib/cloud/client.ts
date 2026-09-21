/**
 * The ONLY module that talks to the network, and it only ever moves two
 * things: an email address (to sign in) and an encrypted envelope (see
 * crypto.ts). Plaintext plans never pass through here — callers hand this
 * module ciphertext, and that boundary is the point of the file.
 *
 * supabase-js is imported dynamically so visitors who never open the
 * account panel never download or run it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { CLOUD } from './config';
import { parseEnvelope, type Envelope } from './crypto';

/** Third approved storage key: the signed-in session (tokens only). */
const SESSION_KEY = 'workoptional:session:v1';

// A module-level singleton holding an AUTHENTICATED client would be a
// cross-user leak if this module were ever evaluated on the server, where
// module scope is shared between requests. It never is (it's reached only
// through an `ssr: false` dynamic import) — and `client()` refuses to run
// without a `window`, so that stays true even if someone imports it wrong.
let clientPromise: Promise<SupabaseClient> | null = null;

function client(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('the sync client is browser-only'));
  }
  if (!CLOUD) return Promise.reject(new Error('cloud sync is not configured'));
  const { url, anonKey } = CLOUD;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, anonKey, {
      auth: {
        storageKey: SESSION_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  return clientPromise;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s);

/** Email a one-time code (creates the account on first use). */
export async function sendCode(email: string): Promise<void> {
  const sb = await client();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const sb = await client();
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
}

export async function currentEmail(): Promise<string | null> {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function onAuthChange(cb: (email: string | null) => void): Promise<() => void> {
  const sb = await client();
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session?.user.email ?? null));
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  const sb = await client();
  await sb.auth.signOut();
}

export type RemoteVault = { envelope: Envelope; updatedAt: string };

/** The signed-in user's vault, or null if they have none (RLS scopes it). */
export async function fetchVault(): Promise<RemoteVault | null> {
  const sb = await client();
  const { data, error } = await sb.from('vaults').select('envelope, updated_at').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const envelope = parseEnvelope(data.envelope);
  if (!envelope || typeof data.updated_at !== 'string') throw new Error('unreadable vault');
  return { envelope, updatedAt: data.updated_at };
}

/**
 * Save with optimistic concurrency: `expected` is the `updated_at` this
 * device last saw (null = "I believe there is no vault yet"). If another
 * device wrote in between, nothing is overwritten and 'conflict' comes back
 * — silently clobbering someone's finances is the worst thing sync can do.
 */
export async function saveVault(
  envelope: Envelope,
  expected: string | null,
): Promise<{ ok: true; updatedAt: string } | { ok: false; reason: 'conflict' }> {
  const sb = await client();
  if (expected === null) {
    const { data, error } = await sb.from('vaults').insert({ envelope }).select('updated_at');
    if (error) {
      if (error.code === '23505') return { ok: false, reason: 'conflict' }; // row already exists
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
}

/** Remove the cloud copy. Local data is untouched. */
export async function deleteVault(): Promise<void> {
  const sb = await client();
  // RLS restricts this to the caller's own row; the filter is belt-and-braces
  // (PostgREST refuses an unfiltered delete).
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error('not signed in');
  const { error } = await sb.from('vaults').delete().eq('user_id', data.user.id);
  if (error) throw error;
}
