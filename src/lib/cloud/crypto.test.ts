import { describe, expect, it } from 'vitest';

import {
  decrypt,
  deriveKey,
  encrypt,
  KDF_ITERATIONS,
  newSalt,
  parseEnvelope,
  WrongPassphraseError,
  type Envelope,
} from './crypto';

// Real iteration counts make the suite crawl; the floor the parser accepts
// is still a real PBKDF2 run, and one test below uses the production count.
const ITER = 100_000;
const secret = JSON.stringify({ plan: 'retire at 50', netWorth: 123_456 });

async function sealed(pass = 'correct horse battery') {
  const salt = newSalt();
  const key = await deriveKey(pass, salt, ITER);
  return { salt, key, env: await encrypt(secret, key, salt, ITER) };
}

describe('end-to-end encryption', () => {
  it('round-trips, and the envelope contains no plaintext', async () => {
    const { env, key } = await sealed();
    expect(await decrypt(env, key)).toBe(secret);
    const wire = JSON.stringify(env);
    expect(wire).not.toContain('retire');
    expect(wire).not.toContain('123456');
    expect(wire).not.toContain('correct horse');
  });

  it('a second device re-derives the same key from passphrase + stored salt', async () => {
    const { env, salt } = await sealed('shared passphrase!');
    const otherDevice = await deriveKey('shared passphrase!', salt, env.iter);
    expect(await decrypt(env, otherDevice)).toBe(secret);
  });

  it('rejects a wrong passphrase', async () => {
    const { env, salt } = await sealed();
    const wrong = await deriveKey('correct horse batterz', salt, ITER);
    await expect(decrypt(env, wrong)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('detects tampering with the ciphertext or the IV', async () => {
    const { env, key } = await sealed();
    const flip = (b64: string) => (b64[0] === 'A' ? 'B' : 'A') + b64.slice(1);
    await expect(decrypt({ ...env, ct: flip(env.ct) }, key)).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    await expect(decrypt({ ...env, iv: flip(env.iv) }, key)).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it('never reuses an IV, and never produces the same ciphertext twice', async () => {
    const salt = newSalt();
    const key = await deriveKey('some passphrase', salt, ITER);
    const a = await encrypt(secret, key, salt, ITER);
    const b = await encrypt(secret, key, salt, ITER);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('salts are random, and the key is not extractable', async () => {
    expect(newSalt()).not.toBe(newSalt());
    const key = await deriveKey('some passphrase', newSalt(), ITER);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeDefined();
  });

  it('treats Unicode-equivalent passphrases as the same passphrase', async () => {
    const salt = newSalt();
    const composed = await deriveKey('café passphrase', salt, ITER);
    const env = await encrypt(secret, composed, salt, ITER);
    const decomposed = await deriveKey('café passphrase', salt, ITER);
    expect(await decrypt(env, decomposed)).toBe(secret);
  });

  it('works at the production iteration count', async () => {
    const salt = newSalt();
    const key = await deriveKey('production strength', salt);
    const env = await encrypt(secret, key, salt);
    expect(env.iter).toBe(KDF_ITERATIONS);
    expect(await decrypt(env, key)).toBe(secret);
  }, 30_000);
});

describe('envelopes from the server are untrusted', () => {
  const good = async (): Promise<Envelope> => (await sealed()).env;

  it('accepts what encrypt() produced', async () => {
    const env = await good();
    expect(parseEnvelope(JSON.parse(JSON.stringify(env)))).toEqual(env);
  });

  it('rejects wrong versions, KDFs and shapes', async () => {
    const env = await good();
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope('x')).toBeNull();
    expect(parseEnvelope({ ...env, v: 2 })).toBeNull();
    expect(parseEnvelope({ ...env, kdf: 'none' })).toBeNull();
    expect(parseEnvelope({ ...env, salt: 'short' })).toBeNull();
    expect(parseEnvelope({ ...env, iv: '!!!not-base64!!' })).toBeNull();
    expect(parseEnvelope({ ...env, ct: '' })).toBeNull();
  });

  it('refuses iteration counts that would weaken or freeze the browser', async () => {
    const env = await good();
    expect(parseEnvelope({ ...env, iter: 1 })).toBeNull(); // downgrade
    expect(parseEnvelope({ ...env, iter: 1e12 })).toBeNull(); // DoS
    expect(parseEnvelope({ ...env, iter: 600000.5 })).toBeNull();
  });

  it('caps ciphertext size', async () => {
    const env = await good();
    expect(parseEnvelope({ ...env, ct: 'A'.repeat(4_000_004) })).toBeNull();
  });
});
