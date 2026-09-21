import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The isolation guarantee, as a test.
 *
 * "One person's numbers can never reach another person" is true of this app
 * by construction: there is no server-side data path at all, so each
 * visitor's plan exists only in their own browser's storage for this origin.
 * This file pins the constructions that make it true, so that adding a
 * network call, a third storage key, an API route or a cookie fails loudly
 * instead of quietly changing what the app promises.
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

  it('makes no network calls of any kind', () => {
    expect(
      offenders(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b|\baxios\b/),
    ).toEqual([]);
  });

  it('has no API routes, server actions, cookies or env-driven behavior', () => {
    expect(files.filter((f) => /(^|\/)route\.tsx?$/.test(f.path)).map((f) => f.path)).toEqual([]);
    expect(offenders(/['"]use server['"]/)).toEqual([]);
    expect(offenders(/document\.cookie|\bcookies\s*\(/)).toEqual([]);
    // NODE_ENV (dev vs prod CSP) is the only environment input.
    const env = files.flatMap((f) => f.code.match(/process\.env\.\w+/g) ?? []);
    expect([...new Set(env)]).toEqual(['process.env.NODE_ENV']);
  });
});

describe('data isolation — storage is two keys, one file', () => {
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
    const calls = [...client.matchAll(/localStorage\.(\w+)\(\s*([^,)\s]+)/g)].map((m) => [m[1], m[2]]);
    expect(calls.length).toBeGreaterThan(0);
    for (const [method, arg] of calls) {
      expect(['getItem', 'setItem', 'removeItem']).toContain(method);
      expect(['STORAGE_KEY', 'LEDGER_KEY', 'LEGACY_STORAGE_KEY']).toContain(arg);
    }
    // No bulk or computed access that could sidestep the list above.
    expect(/localStorage\.clear|localStorage\[|localStorage\.key\(/.test(client)).toBe(false);
  });
});

describe('data isolation — the server never shares a response', () => {
  const proxy = readFileSync(join(ROOT, 'proxy.ts'), 'utf8');

  it('CSP confines connections to this origin and generates a nonce per request', () => {
    expect(proxy).toContain("`connect-src 'self'`");
    expect(proxy).toContain("`default-src 'self'`");
    expect(proxy).toContain("`frame-ancestors 'none'`");
    expect(proxy).toMatch(/crypto\.randomUUID\(\)/);
    expect(/connect-src[^`]*(\*|https?:)/.test(proxy)).toBe(false);
  });

  it('keeps no mutable module-level state that could bleed between requests', () => {
    expect(offenders(/^(export\s+)?(let|var)\s/m)).toEqual([]);
  });
});
