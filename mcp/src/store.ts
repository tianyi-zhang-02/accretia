import fs from 'node:fs';
import path from 'node:path';

/**
 * The ONLY module that touches the filesystem, and only these files, inside
 * one directory that only the current user can read (0700 / 0600):
 *
 *   vault.json         the encrypted vault (same envelope as the cloud copy)
 *   session.json       the sync sign-in, encrypted with the passphrase
 *   RECOVERY-CODE.txt  written once when a local-only vault is created
 *
 * Every write is atomic (temp file + rename), so a crash never leaves a
 * half-written vault behind.
 */

export const FILES = ['vault.json', 'session.json', 'RECOVERY-CODE.txt'] as const;
export type FileName = (typeof FILES)[number];

export class Store {
  constructor(readonly dir: string) {}

  private ensureDir() {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.dir, 0o700);
  }

  path(name: FileName): string {
    if (!(FILES as readonly string[]).includes(name)) throw new Error('unknown file');
    return path.join(this.dir, name);
  }

  read(name: FileName): string | null {
    try {
      return fs.readFileSync(this.path(name), 'utf8');
    } catch {
      return null;
    }
  }

  readJson(name: FileName): unknown {
    const text = this.read(name);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  write(name: FileName, text: string) {
    this.ensureDir();
    const target = this.path(name);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    fs.renameSync(tmp, target);
    fs.chmodSync(target, 0o600);
  }

  writeJson(name: FileName, value: unknown) {
    this.write(name, JSON.stringify(value));
  }

  remove(name: FileName) {
    try {
      fs.unlinkSync(this.path(name));
    } catch {
      // already gone
    }
  }
}
