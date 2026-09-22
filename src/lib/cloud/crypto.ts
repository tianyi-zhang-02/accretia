/**
 * End-to-end encryption for cloud sync.
 *
 * The server only ever stores the envelope produced here: ciphertext plus
 * the public parameters needed to re-derive the keys. Passphrases, recovery
 * codes and keys never leave the device and are never written to storage —
 * not by this module, and callers must keep it that way. Whoever runs the
 * database (including the app's owner) cannot read a user's plan.
 *
 * Primitives are WebCrypto only — no dependency to audit:
 *   - PBKDF2-HMAC-SHA256, 600k iterations (OWASP's current floor for this
 *     KDF), 16-byte random salt → AES-256 key. Argon2 would be better but
 *     isn't in WebCrypto; iteration count is stored so it can rise later.
 *   - AES-256-GCM, fresh random 96-bit IV for EVERY encryption. GCM's tag
 *     doubles as the wrong-passphrase / tampering check.
 *
 * Two envelope versions:
 *   v1 — the data is encrypted directly with the passphrase-derived key.
 *   v2 — the data is encrypted with a random DATA key, and that key is
 *        stored wrapped (AES-GCM) under a passphrase-derived key AND under a
 *        key derived from a random RECOVERY CODE. Either secret opens the
 *        vault; the server holds neither. Forgetting the passphrase is
 *        survivable with the code — and only with the code. The UI must
 *        still say so: with both lost, the cloud copy is gone for good.
 * v1 vaults keep working and become v2 the first time a recovery code is
 * added (the plaintext is on the device, so re-encrypting is free).
 */

export const KDF_ITERATIONS = 600_000;
/** Bounds on what we'll accept from the server — it is untrusted input, and
 *  an absurd iteration count is a free denial-of-service on the browser. */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;
const MAX_CIPHERTEXT_B64 = 4_000_000;
export const MIN_PASSPHRASE_LENGTH = 10;

/** A data key wrapped under a derived key: the KDF inputs + the wrapped bytes. */
export type Wrap = {
  iter: number;
  /** base64 */
  salt: string;
  iv: string;
  /** base64 — 32-byte key + 16-byte GCM tag */
  k: string;
};

export type Envelope =
  | { v: 1; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string }
  | {
      v: 2;
      kdf: 'PBKDF2-SHA256';
      iv: string;
      ct: string;
      keys: { pass: Wrap; recovery?: Wrap };
    };

/**
 * An unlocked vault: the key that opens the data, and the wraps to carry
 * forward. Memory only. A v1 vault's data key IS the passphrase key.
 */
export type VaultKeys =
  | { v: 1; dek: CryptoKey; iter: number; salt: string }
  | {
      v: 2;
      /** Extractable, so it can be re-wrapped when a passphrase or code changes. */
      dek: CryptoKey;
      /** Null right after a recovery, until a new passphrase is chosen. */
      pass: Wrap | null;
      recovery: Wrap | null;
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

const AES = { name: 'AES-GCM', length: 256 } as const;

/** Derive a (non-extractable) AES key from a secret. Slow on purpose. */
export async function deriveKey(
  secret: string,
  saltB64: string,
  iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    material,
    AES,
    false, // non-extractable: even our own code can't read the key bytes back
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('wrong passphrase or corrupted data');
    this.name = 'WrongPassphraseError';
  }
}

// ---------- v1 primitives (still used for legacy vaults) ----------

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

// ---------- recovery codes ----------

/** RFC 4648 base32 — no 0/1/8, so a code can be read back from paper. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const RECOVERY_CODE_LENGTH = 32; // 160 bits, shown as 8 groups of 4

/** A fresh code, formatted for humans: XXXX-XXXX-…  (8 groups). */
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-');
}

/**
 * What a person types back → canonical form, or null. Forgiving about case,
 * spaces, dashes and the classic misreads (0→O, 1→I, 8→B).
 */
export function normalizeRecoveryCode(raw: string): string | null {
  const s = raw
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/8/g, 'B')
    .replace(/[^A-Z2-7]/g, '');
  return s.length === RECOVERY_CODE_LENGTH ? s : null;
}

// ---------- v2: wrapped data key ----------

async function wrapUnder(dek: CryptoKey, secret: string): Promise<Wrap> {
  const salt = newSalt();
  const kek = await deriveKey(secret, salt, KDF_ITERATIONS);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  return { iter: KDF_ITERATIONS, salt, iv: toB64(iv), k: toB64(new Uint8Array(k)) };
}

async function unwrapWith(wrap: Wrap, secret: string): Promise<CryptoKey> {
  const kek = await deriveKey(secret, wrap.salt, wrap.iter);
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      fromB64(wrap.k),
      kek,
      { name: 'AES-GCM', iv: fromB64(wrap.iv) },
      AES,
      true,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new WrongPassphraseError();
  }
}

/** A brand-new vault: random data key, wrapped under the passphrase and a fresh code. */
export async function createVault(
  passphrase: string,
): Promise<{ vault: VaultKeys; recoveryCode: string }> {
  const dek = await crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);
  const recoveryCode = newRecoveryCode();
  const [pass, recovery] = await Promise.all([
    wrapUnder(dek, passphrase),
    wrapUnder(dek, normalizeRecoveryCode(recoveryCode)!),
  ]);
  return { vault: { v: 2, dek, pass, recovery }, recoveryCode };
}

/** Prove a secret against the server's envelope. Wrong → WrongPassphraseError. */
export async function unlock(
  envelope: Envelope,
  secret: { passphrase: string } | { recoveryCode: string },
): Promise<VaultKeys> {
  if (envelope.v === 1) {
    if (!('passphrase' in secret)) throw new WrongPassphraseError(); // v1 has no code
    const dek = await deriveKey(secret.passphrase, envelope.salt, envelope.iter);
    await decrypt(envelope, dek); // proves it
    return { v: 1, dek, iter: envelope.iter, salt: envelope.salt };
  }
  const { pass, recovery } = envelope.keys;
  let dek: CryptoKey;
  if ('passphrase' in secret) dek = await unwrapWith(pass, secret.passphrase);
  else {
    const code = normalizeRecoveryCode(secret.recoveryCode);
    if (!recovery || !code) throw new WrongPassphraseError();
    dek = await unwrapWith(recovery, code);
  }
  return { v: 2, dek, pass, recovery: recovery ?? null };
}

/** Give a vault a (new) recovery code. A v1 vault becomes v2 here. */
export async function addRecoveryCode(
  vault: VaultKeys,
): Promise<{ vault: VaultKeys; recoveryCode: string }> {
  const recoveryCode = newRecoveryCode();
  if (vault.v === 2) {
    return {
      vault: {
        ...vault,
        recovery: await wrapUnder(vault.dek, normalizeRecoveryCode(recoveryCode)!),
      },
      recoveryCode,
    };
  }
  // Legacy: mint a data key and wrap it under the passphrase key we already
  // hold (same salt + iterations, so the passphrase itself is unchanged).
  const dek = await crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.wrapKey('raw', dek, vault.dek, { name: 'AES-GCM', iv });
  const pass: Wrap = {
    iter: vault.iter,
    salt: vault.salt,
    iv: toB64(iv),
    k: toB64(new Uint8Array(k)),
  };
  return {
    vault: {
      v: 2,
      dek,
      pass,
      recovery: await wrapUnder(dek, normalizeRecoveryCode(recoveryCode)!),
    },
    recoveryCode,
  };
}

/** Re-wrap the data key under a new passphrase (after a recovery, or by choice). */
export async function setPassphrase(vault: VaultKeys, passphrase: string): Promise<VaultKeys> {
  if (vault.v !== 2) throw new Error('add a recovery code first'); // upgrades to v2
  return { ...vault, pass: await wrapUnder(vault.dek, passphrase) };
}

/** Seal the plaintext for upload. Fresh IV every time. */
export async function seal(plaintext: string, vault: VaultKeys): Promise<Envelope> {
  if (vault.v === 1) return encrypt(plaintext, vault.dek, vault.salt, vault.iter);
  if (!vault.pass) throw new Error('choose a passphrase before uploading');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vault.dek, enc.encode(plaintext));
  return {
    v: 2,
    kdf: 'PBKDF2-SHA256',
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
    keys: { pass: vault.pass, ...(vault.recovery ? { recovery: vault.recovery } : {}) },
  };
}

/** Open a downloaded envelope with an unlocked vault. */
export function open(envelope: Envelope, vault: VaultKeys): Promise<string> {
  return decrypt(envelope, vault.dek);
}

// ---------- untrusted input ----------

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function b64Field(v: unknown, len?: number): v is string {
  return (
    typeof v === 'string' && v.length > 0 && B64.test(v) && (len === undefined || v.length === len)
  );
}

function parseWrap(raw: unknown): Wrap | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.iter !== 'number' || !Number.isInteger(w.iter)) return null;
  if (w.iter < MIN_ITERATIONS || w.iter > MAX_ITERATIONS) return null;
  if (!b64Field(w.salt, 24) || !b64Field(w.iv, 16) || !b64Field(w.k, 64)) return null;
  return { iter: w.iter, salt: w.salt, iv: w.iv, k: w.k };
}

/** Validate an envelope that came back from the server. */
export function parseEnvelope(raw: unknown): Envelope | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (e.kdf !== 'PBKDF2-SHA256') return null;
  if (!b64Field(e.iv, 16) || !b64Field(e.ct) || e.ct.length > MAX_CIPHERTEXT_B64) return null;
  if (e.v === 1) {
    if (typeof e.iter !== 'number' || !Number.isInteger(e.iter)) return null;
    if (e.iter < MIN_ITERATIONS || e.iter > MAX_ITERATIONS) return null;
    if (!b64Field(e.salt, 24)) return null;
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: e.iter, salt: e.salt, iv: e.iv, ct: e.ct };
  }
  if (e.v === 2) {
    if (typeof e.keys !== 'object' || e.keys === null) return null;
    const keys = e.keys as Record<string, unknown>;
    const pass = parseWrap(keys.pass);
    if (!pass) return null;
    const recovery = keys.recovery === undefined ? undefined : parseWrap(keys.recovery);
    if (recovery === null) return null;
    return {
      v: 2,
      kdf: 'PBKDF2-SHA256',
      iv: e.iv,
      ct: e.ct,
      keys: { pass, ...(recovery ? { recovery } : {}) },
    };
  }
  return null;
}
