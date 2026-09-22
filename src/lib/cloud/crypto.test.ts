import { describe, expect, it } from 'vitest';

import {
  addRecoveryCode,
  createVault,
  decrypt,
  deriveKey,
  encrypt,
  KDF_ITERATIONS,
  newRecoveryCode,
  newSalt,
  normalizeRecoveryCode,
  open,
  parseEnvelope,
  RECOVERY_CODE_LENGTH,
  seal,
  setPassphrase,
  unlock,
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
    const otherDevice = await deriveKey('shared passphrase!', salt, ITER);
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
    expect(env.v === 1 && env.iter).toBe(KDF_ITERATIONS);
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

describe('recovery codes', () => {
  it('are random, base32 without look-alikes, and forgiving to type back', () => {
    const a = newRecoveryCode();
    const b = newRecoveryCode();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(normalizeRecoveryCode(a)).toHaveLength(RECOVERY_CODE_LENGTH);
    expect(normalizeRecoveryCode(a.toLowerCase().replace(/-/g, ' '))).toBe(
      normalizeRecoveryCode(a),
    );
    // Misreads off paper.
    const canon = normalizeRecoveryCode(a)!;
    const misread = canon.replace(/O/g, '0').replace(/I/g, '1').replace(/B/g, '8');
    expect(normalizeRecoveryCode(misread)).toBe(canon);
    expect(normalizeRecoveryCode(canon.slice(1))).toBeNull();
    expect(normalizeRecoveryCode('')).toBeNull();
  });
});

describe('v2 vaults — a data key wrapped under a passphrase and a recovery code', () => {
  const T = 60_000; // each wrap is a real 600k-iteration PBKDF2

  it(
    'either secret opens the vault; the wire carries neither, nor the data key',
    async () => {
      const { vault, recoveryCode } = await createVault('correct horse battery');
      const env = await seal(secret, vault);
      expect(env.v).toBe(2);
      const wire = JSON.stringify(env);
      expect(wire).not.toContain('retire');
      expect(wire).not.toContain('correct horse');
      expect(wire).not.toContain(recoveryCode.replace(/-/g, ''));
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', vault.dek));
      expect(wire).not.toContain(btoa(String.fromCharCode(...raw)));

      const byPass = await unlock(env, { passphrase: 'correct horse battery' });
      expect(await open(env, byPass)).toBe(secret);
      const byCode = await unlock(env, { recoveryCode: recoveryCode.toLowerCase() });
      expect(await open(env, byCode)).toBe(secret);
    },
    T,
  );

  it(
    'rejects a wrong passphrase, a wrong code, and a tampered wrap',
    async () => {
      const { vault } = await createVault('correct horse battery');
      const env = await seal(secret, vault);
      await expect(unlock(env, { passphrase: 'correct horse batterz' })).rejects.toBeInstanceOf(
        WrongPassphraseError,
      );
      await expect(unlock(env, { recoveryCode: newRecoveryCode() })).rejects.toBeInstanceOf(
        WrongPassphraseError,
      );
      if (env.v !== 2) throw new Error('unreachable');
      const flip = (b64: string) => (b64[0] === 'A' ? 'B' : 'A') + b64.slice(1);
      const tampered = {
        ...env,
        keys: { ...env.keys, pass: { ...env.keys.pass, k: flip(env.keys.pass.k) } },
      };
      await expect(
        unlock(tampered, { passphrase: 'correct horse battery' }),
      ).rejects.toBeInstanceOf(WrongPassphraseError);
    },
    T,
  );

  it(
    'after a recovery, a new passphrase opens it and the old one does not; the code still works',
    async () => {
      const { vault, recoveryCode } = await createVault('forgotten already');
      const env = await seal(secret, vault);
      const recovered = await unlock(env, { recoveryCode });
      const fresh = await setPassphrase(recovered, 'brand new passphrase');
      const env2 = await seal(secret, fresh);
      await expect(unlock(env2, { passphrase: 'forgotten already' })).rejects.toBeInstanceOf(
        WrongPassphraseError,
      );
      expect(await open(env2, await unlock(env2, { passphrase: 'brand new passphrase' }))).toBe(
        secret,
      );
      expect(await open(env2, await unlock(env2, { recoveryCode }))).toBe(secret);
    },
    T,
  );

  it(
    'a legacy v1 vault gains a code without changing its passphrase',
    async () => {
      const salt = newSalt();
      const key = await deriveKey('old passphrase', salt, ITER);
      const v1 = await encrypt(secret, key, salt, ITER);
      const legacy = await unlock(v1, { passphrase: 'old passphrase' });
      expect(legacy.v).toBe(1);
      await expect(unlock(v1, { recoveryCode: newRecoveryCode() })).rejects.toBeInstanceOf(
        WrongPassphraseError,
      );

      const { vault, recoveryCode } = await addRecoveryCode(legacy);
      const env = await seal(secret, vault);
      expect(env.v).toBe(2);
      expect(await open(env, await unlock(env, { passphrase: 'old passphrase' }))).toBe(secret);
      expect(await open(env, await unlock(env, { recoveryCode }))).toBe(secret);
    },
    T,
  );

  it(
    'regenerating the code retires the old one',
    async () => {
      const { vault, recoveryCode: first } = await createVault('same passphrase');
      const { vault: rotated, recoveryCode: second } = await addRecoveryCode(vault);
      const env = await seal(secret, rotated);
      await expect(unlock(env, { recoveryCode: first })).rejects.toBeInstanceOf(
        WrongPassphraseError,
      );
      expect(await open(env, await unlock(env, { recoveryCode: second }))).toBe(secret);
    },
    T,
  );

  it(
    'v2 envelopes from the server are validated field by field',
    async () => {
      const { vault } = await createVault('correct horse battery');
      const env = await seal(secret, vault);
      if (env.v !== 2) throw new Error('unreachable');
      expect(parseEnvelope(JSON.parse(JSON.stringify(env)))).toEqual(env);
      expect(parseEnvelope({ ...env, keys: {} })).toBeNull();
      expect(parseEnvelope({ ...env, keys: { pass: { ...env.keys.pass, iter: 1 } } })).toBeNull();
      expect(
        parseEnvelope({ ...env, keys: { pass: { ...env.keys.pass, k: 'short' } } }),
      ).toBeNull();
      expect(parseEnvelope({ ...env, keys: { pass: env.keys.pass, recovery: 'x' } })).toBeNull();
      const { recovery: _r, ...passOnly } = env.keys;
      void _r;
      expect(parseEnvelope({ ...env, keys: passOnly })).toEqual({ ...env, keys: passOnly });
      expect(parseEnvelope({ ...env, v: 3 })).toBeNull();
    },
    T,
  );
});
