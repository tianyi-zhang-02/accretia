import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The isolation guarantee, as a test.
 *
 * Two promises, both pinned here so they fail loudly instead of drifting:
 *
 *   1. Signed out (or on a deployment without cloud sync configured), nothing
 *      leaves the browser. There is no server-side data path in this app.
 *   2. Signed in, the ONLY thing that leaves is an end-to-end-encrypted
 *      envelope. The network lives in exactly one module, that module is
 *      loaded lazily, rendered only when sync is configured, and is handed
 *      ciphertext — it cannot import the code that knows what a plan is.
 *
 * It scans source text (comments stripped) — crude on purpose: a guard that
 * is easy to read is a guard people keep.
 */

const ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const files = walk(ROOT)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ path: relative(ROOT, f), code: stripComments(readFileSync(f, 'utf8')) }));

const offenders = (re: RegExp, allow: string[] = []) =>
  files.filter((f) => !allow.includes(f.path) && re.test(f.code)).map((f) => f.path);

describe('data isolation — nothing can leave the browser', () => {
  it('scans a real source tree', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.path === 'app/simulator-client.tsx')).toBe(true);
  });

  it('makes no direct network calls anywhere', () => {
    expect(
      offenders(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b|\baxios\b/),
    ).toEqual([]);
  });

  it('confines the one network dependency to lib/cloud/client, loaded lazily', () => {
    expect(offenders(/@supabase\/supabase-js/)).toEqual(['lib/cloud/client.ts']);
    const client = files.find((f) => f.path === 'lib/cloud/client.ts')!.code;
    // Types may be imported statically; the runtime must be a dynamic import.
    expect(/^import\s+(?!type\b)[^;]*@supabase\/supabase-js/m.test(client)).toBe(false);
    expect(client).toMatch(/import\('@supabase\/supabase-js'\)/);
  });

  it('the network module only ever sees ciphertext', () => {
    const client = files.find((f) => f.path === 'lib/cloud/client.ts')!.code;
    const imports = [...client.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    // config (where), crypto (envelope type + validation), the SDK types.
    // NOT backup, ledger, validation or the simulator: it can't know a plan.
    expect(imports).toEqual(['./config', './crypto', '@supabase/supabase-js']);
    expect(client).toMatch(/saveVault\(\s*envelope: Envelope/);
  });

  it('only the sync panel uses the network module, and it renders only when configured', () => {
    expect(offenders(/lib\/cloud\/client/)).toEqual(['components/data/cloud-sync.tsx']);
    expect(offenders(/components\/data\/cloud-sync/)).toEqual(['app/simulator-client.tsx']);
    const app = files.find((f) => f.path === 'app/simulator-client.tsx')!.code;
    expect(app).toMatch(
      /dynamic\(\(\) => import\('@\/components\/data\/cloud-sync'\), \{ ssr: false \}\)/,
    );
    expect(app).toMatch(/\{CLOUD \? \(\s*<CloudSync/);
  });

  it('never persists the passphrase or the key', () => {
    const panel = files.find((f) => f.path === 'components/data/cloud-sync.tsx')!.code;
    const crypto = files.find((f) => f.path === 'lib/cloud/crypto.ts')!.code;
    for (const code of [panel, crypto]) {
      expect(/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code)).toBe(false);
    }
    expect(crypto).toMatch(/false,\s*\[\s*'encrypt',\s*'decrypt'\s*\]/); // non-extractable key
  });

  it('has no API routes, server actions, cookies or env-driven behavior', () => {
    expect(files.filter((f) => /(^|\/)route\.tsx?$/.test(f.path)).map((f) => f.path)).toEqual([]);
    expect(offenders(/['"]use server['"]/)).toEqual([]);
    expect(offenders(/document\.cookie|\bcookies\s*\(/)).toEqual([]);
    // NODE_ENV (dev vs prod CSP) plus the two PUBLIC sync settings. No secrets:
    // anything not NEXT_PUBLIC_ would be a server-side credential, which this
    // app must never have.
    const env = files.flatMap((f) => f.code.match(/process\.env\.\w+/g) ?? []);
    expect([...new Set(env)].sort()).toEqual([
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'process.env.NEXT_PUBLIC_SUPABASE_URL',
      'process.env.NODE_ENV',
    ]);
    expect(offenders(/service_role|SERVICE_ROLE/)).toEqual([]);
  });
});

describe('data isolation — storage is a short, named list', () => {
  it('touches browser storage in exactly one module', () => {
    expect(offenders(/\blocalStorage\b/)).toEqual(['app/simulator-client.tsx']);
    expect(offenders(/\bsessionStorage\b|\bindexedDB\b|\bopenDatabase\b/)).toEqual([]);
  });

  it('only ever uses the approved keys, through named constants', () => {
    const client = files.find((f) => f.path === 'app/simulator-client.tsx')!.code;
    const keys = [...client.matchAll(/const (\w*KEY) = '([^']+)'/g)].map((m) => [m[1], m[2]]);
    expect(keys).toEqual([
      ['STORAGE_KEY', 'workoptional:saved:v1'],
      ['LEDGER_KEY', 'workoptional:ledger:v1'],
      ['LEGACY_STORAGE_KEY', 'accretia:saved:v1'], // read-once migration, then removed
    ]);
    const calls = [...client.matchAll(/localStorage\.(\w+)\(\s*([^,)\s]+)/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(calls.length).toBeGreaterThan(0);
    for (const [method, arg] of calls) {
      expect(['getItem', 'setItem', 'removeItem']).toContain(method);
      expect(['STORAGE_KEY', 'LEDGER_KEY', 'LEGACY_STORAGE_KEY']).toContain(arg);
    }
    // No bulk or computed access that could sidestep the list above.
    expect(/localStorage\.clear|localStorage\[|localStorage\.key\(/.test(client)).toBe(false);
  });

  it('the only other key is the sign-in session, named in the network module', () => {
    const all = files.flatMap((f) =>
      [...f.code.matchAll(/const (\w*KEY) = '([^']+)'/g)].map((m) => `${f.path}:${m[2]}`),
    );
    expect(all.sort()).toEqual([
      'app/simulator-client.tsx:accretia:saved:v1',
      'app/simulator-client.tsx:workoptional:ledger:v1',
      'app/simulator-client.tsx:workoptional:saved:v1',
      'lib/cloud/client.ts:workoptional:session:v1',
    ]);
  });
});

describe('data isolation — the server never shares a response', () => {
  const proxy = readFileSync(join(ROOT, 'proxy.ts'), 'utf8');

  it('CSP confines connections to this origin and generates a nonce per request', () => {
    // 'self', plus at most the configured sync origin — a variable, never a
    // literal host and never a wildcard.
    expect(proxy).toContain("`connect-src 'self'${cloudOrigin ? ` ${cloudOrigin}` : ''}`");
    expect(proxy).toContain("`default-src 'self'`");
    expect(proxy).toContain("`frame-ancestors 'none'`");
    expect(proxy).toMatch(/crypto\.randomUUID\(\)/);
    expect(/connect-src[^`]*(\*|https?:)/.test(proxy)).toBe(false);
    expect(proxy).toMatch(/readCloudConfig\(\)\?\.url/);
  });

  it('keeps no mutable module-level state that could bleed between requests', () => {
    // One deliberate exception: the browser-only sync client singleton. It is
    // allowed ONLY because it refuses to run without a `window` — pinned
    // here so the exception can't outlive its mitigation.
    expect(offenders(/^(export\s+)?(let|var)\s/m, ['lib/cloud/client.ts'])).toEqual([]);
    const client = files.find((f) => f.path === 'lib/cloud/client.ts')!.code;
    expect([...client.matchAll(/^(?:export\s+)?(?:let|var)\s+(\w+)/gm)].map((m) => m[1])).toEqual([
      'clientPromise',
    ]);
    expect(client).toMatch(/typeof window === 'undefined'[\s\S]{0,120}Promise\.reject/);
  });
});
