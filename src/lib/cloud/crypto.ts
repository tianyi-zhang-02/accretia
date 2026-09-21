/**
 * End-to-end encryption for cloud sync.
 *
 * The server only ever stores the envelope produced here: ciphertext plus
 * the public parameters needed to re-derive the key. The passphrase and the
 * key never leave the device and are never written to storage — not by this
 * module, and callers must keep it that way. Whoever runs the database
 * (including the app's owner) cannot read a user's plan.
 *
 * Primitives are WebCrypto only — no dependency to audit:
 *   - PBKDF2-HMAC-SHA256, 600k iterations (OWASP's current floor for this
 *     KDF), 16-byte random salt → AES-256 key. Argon2 would be better but
 *     isn't in WebCrypto; iteration count is stored so it can rise later.
 *   - AES-256-GCM, fresh random 96-bit IV for EVERY encryption. GCM's tag
 *     doubles as the wrong-passphrase / tampering check.
 *
 * The flip side is absolute and the UI must say so: a forgotten passphrase
 * makes the cloud copy unrecoverable. The local backup file is the safety
 * net.
 */

export const KDF_ITERATIONS = 600_000;
/** Bounds on what we'll accept from the server — it is untrusted input, and
 *  an absurd iteration count is a free denial-of-service on the browser. */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;
const MAX_CIPHERTEXT_B64 = 4_000_000;
export const MIN_PASSPHRASE_LENGTH = 10;

export type Envelope = {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  /** base64 */
  salt: string;
  iv: string;
  ct: string;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

export function newSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Derive the (non-extractable) AES key. Slow on purpose. */
export async function deriveKey(
  passphrase: string,
  saltB64: string,
  iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: even our own code can't read the key bytes back
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(
  plaintext: string,
  key: CryptoKey,
  saltB64: string,
  iterations: number = KDF_ITERATIONS,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: iterations,
    salt: saltB64,
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('wrong passphrase or corrupted data');
    this.name = 'WrongPassphraseError';
  }
}

/** Throws WrongPassphraseError when the tag doesn't verify — GCM can't tell
 *  a bad key from tampered bytes, and the caller shouldn't pretend it can. */
export async function decrypt(envelope: Envelope, key: CryptoKey): Promise<string> {
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(envelope.iv) },
      key,
      fromB64(envelope.ct),
    );
    return dec.decode(pt);
  } catch {
    throw new WrongPassphraseError();
  }
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Validate an envelope that came back from the server. */
export function parseEnvelope(raw: unknown): Envelope | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== 1 || e.kdf !== 'PBKDF2-SHA256') return null;
  if (typeof e.iter !== 'number' || !Number.isInteger(e.iter)) return null;
  if (e.iter < MIN_ITERATIONS || e.iter > MAX_ITERATIONS) return null;
  for (const f of ['salt', 'iv', 'ct'] as const) {
    const v = e[f];
    if (typeof v !== 'string' || v.length === 0 || !B64.test(v)) return null;
  }
  const { salt, iv, ct } = e as { salt: string; iv: string; ct: string };
  if (salt.length !== 24 || iv.length !== 16 || ct.length > MAX_CIPHERTEXT_B64) return null;
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: e.iter, salt, iv, ct };
}
