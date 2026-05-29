/**
 * Client-side AES-GCM encryption for the JSON backup export.
 *
 * Everything in here runs in the browser via Web Crypto. The passphrase
 * never leaves the page — no fetch, no server route, no telemetry. The
 * `decryptBackup` path is symmetric and lives in the same module so the
 * envelope schema has exactly one writer and one reader.
 *
 * Envelope schema (v1):
 *   {
 *     schema_version: 1,
 *     encrypted: true,
 *     kdf: 'PBKDF2',
 *     kdf_hash: 'SHA-256',
 *     iterations: 600_000,
 *     salt: <base64, 16 bytes>,
 *     iv:   <base64, 12 bytes>,
 *     ciphertext: <base64 of AES-GCM output including 128-bit tag>,
 *   }
 *
 * AES-GCM's authentication tag means a wrong key throws OperationError
 * on decrypt — we surface that as "wrong passphrase" without leaking
 * any other distinguishing info.
 */

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 guidance for SHA-256
const PBKDF2_HASH = 'SHA-256' as const;
const SALT_LEN = 16; // bytes
const IV_LEN = 12; // bytes — recommended for GCM
const KEY_LEN = 256; // bits

export type EncryptedBackup = {
  schema_version: 1;
  encrypted: true;
  kdf: 'PBKDF2';
  kdf_hash: 'SHA-256';
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
};

/**
 * The unencrypted payload shape matches the /api/export/backup.json
 * response. Kept loose here on purpose — the encryption layer doesn't
 * care what's inside the bytes.
 */
export type PlainBackup = {
  schema_version: number;
  encrypted?: false;
  exported_at?: string;
  user_id?: string;
  user_email?: string;
  data?: Record<string, unknown[]>;
} & Record<string, unknown>;

// ---------- base64 helpers ----------
// Uint8Array.toBase64() is too new to rely on; use the atob/btoa path.

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

// ---------- KDF ----------

async function deriveKey(
  passphrase: string,
  salt: ArrayBuffer,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    material,
    { name: 'AES-GCM', length: KEY_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------- public API ----------

export async function encryptBackup(
  payload: PlainBackup,
  passphrase: string,
): Promise<EncryptedBackup> {
  if (passphrase.length === 0) throw new Error('Passphrase is empty.');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt.buffer, PBKDF2_ITERATIONS);

  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  return {
    schema_version: 1,
    encrypted: true,
    kdf: 'PBKDF2',
    kdf_hash: PBKDF2_HASH,
    iterations: PBKDF2_ITERATIONS,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
  };
}

export async function decryptBackup(
  envelope: EncryptedBackup,
  passphrase: string,
): Promise<PlainBackup> {
  if (envelope.kdf !== 'PBKDF2') {
    throw new Error(`Unsupported KDF: ${envelope.kdf}`);
  }
  if (envelope.kdf_hash && envelope.kdf_hash !== PBKDF2_HASH) {
    throw new Error(`Unsupported KDF hash: ${envelope.kdf_hash}`);
  }
  if (!Number.isFinite(envelope.iterations) || envelope.iterations < 1) {
    throw new Error('Invalid iterations count.');
  }

  const salt = base64ToBuffer(envelope.salt);
  const iv = base64ToBuffer(envelope.iv);
  const ciphertext = base64ToBuffer(envelope.ciphertext);

  const key = await deriveKey(passphrase, salt, envelope.iterations);

  let plaintextBuf: ArrayBuffer;
  try {
    plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
  } catch {
    // AES-GCM verification failure — could be wrong passphrase OR a corrupt
    // ciphertext. We can't distinguish without leaking info, so the user-
    // facing message stays generic.
    throw new Error('Wrong passphrase or corrupt backup.');
  }

  const text = new TextDecoder().decode(plaintextBuf);
  try {
    return JSON.parse(text) as PlainBackup;
  } catch {
    throw new Error('Decrypted bytes are not valid JSON — backup may be damaged.');
  }
}

/**
 * Type guard for a parsed JSON value — returns true if it looks like an
 * EncryptedBackup envelope (used by the import flow to decide whether to
 * prompt for a passphrase).
 */
export function isEncryptedBackup(v: unknown): v is EncryptedBackup {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.encrypted === true &&
    typeof o.salt === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.ciphertext === 'string' &&
    typeof o.kdf === 'string'
  );
}

/** Iteration count used for new encryptions — surfaced for the UI's info copy. */
export const CURRENT_ITERATIONS = PBKDF2_ITERATIONS;
