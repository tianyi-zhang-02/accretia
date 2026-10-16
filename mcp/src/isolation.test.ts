import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The MCP server's guard rails, pinned like the web app's (src/lib/isolation.test.ts):
 * one network module, one filesystem module, nothing on stdout but the
 * protocol, no environment reads outside config, and no way to hand the
 * passphrase or a recovery code back to the conversation.
 */

const dir = path.dirname(new URL(import.meta.url).pathname);
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ name: f, code: fs.readFileSync(path.join(dir, f), 'utf8') }));
const using = (re: RegExp) =>
  files
    .filter((f) => re.test(f.code))
    .map((f) => f.name)
    .sort();

describe('MCP server isolation', () => {
  it('scans the real files', () => {
    expect(files.map((f) => f.name).sort()).toEqual(
      [
        'cloud.ts',
        'config.ts',
        'edits.ts',
        'index.ts',
        'session-store.ts',
        'store.ts',
        'vault.ts',
      ].sort(),
    );
  });

  it('only cloud.ts touches the network', () => {
    expect(using(/@supabase\/supabase-js/)).toEqual(['cloud.ts']);
    // The global fetch() — not the Remote interface's .fetch() method or its type signature.
    expect(
      using(
        /(?<![.\w])(?<!async )fetch\((?!\):)|node:https?|node:net|node:dgram|WebSocket|XMLHttpRequest/,
      ),
    ).toEqual([]);
  });

  it('only store.ts touches the filesystem, and only its named files', () => {
    expect(using(/node:fs|from 'fs'/)).toEqual(['store.ts']);
    const store = files.find((f) => f.name === 'store.ts')!.code;
    expect(store).toMatch(/mode: 0o700/);
    expect(store).toMatch(/mode: 0o600/);
  });

  it('nothing writes to stdout (it carries the protocol)', () => {
    expect(using(/console\.(log|info|debug)|process\.stdout/)).toEqual([]);
  });

  it('reads the environment only in config.ts', () => {
    expect(using(/process\.env/)).toEqual(['config.ts']);
  });

  it('never hands the passphrase or a recovery code to the conversation', () => {
    const index = files.find((f) => f.name === 'index.ts')!.code;
    // It's handed to the vault and the session storage — never interpolated
    // into anything that could become a tool result.
    expect(index).not.toMatch(/\$\{[^}]*passphrase/i);
    expect(index).not.toMatch(/(text|json|fail)\([^)]*\b(cfg|this)\.passphrase/);
    // Exactly: two "is one configured?" checks, then handed to the session
    // storage and to the vault. Anything more is a new use to justify.
    expect([...index.matchAll(/cfg\.passphrase/g)].length).toBe(4);
    expect(index).not.toMatch(/recoveryCode\b(?!File)/);
    const vault = files.find((f) => f.name === 'vault.ts')!.code;
    expect(vault).toMatch(/store\.write\(\s*'RECOVERY-CODE\.txt'/);
  });

  it('cannot create accounts', () => {
    const cloud = files.find((f) => f.name === 'cloud.ts')!.code;
    expect(cloud).toMatch(/shouldCreateUser: false/);
    expect(cloud).not.toMatch(/shouldCreateUser: true|signUp\(/);
  });
});

describe('works in any MCP client (Claude, Codex, …)', () => {
  // Tool inputs stay in the JSON Schema subset every client handles: one
  // `type` per field, no unions. Codex reduces schemas to a small subset (a
  // union without a top-level type is guessed as a string), so a nullable or
  // literal field silently breaks there. Use a boolean flag instead.
  it('tool input schemas use no unions, nullables or literals', () => {
    expect(
      using(/\.nullable\(|\.nullish\(|z\.union\(|z\.literal\(|\.or\(|z\.discriminatedUnion\(/),
    ).toEqual([]);
  });
});
