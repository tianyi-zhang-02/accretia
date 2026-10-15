import os from 'node:os';
import path from 'node:path';

import { readCloudConfig, type CloudConfig } from '@/lib/cloud/config';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/cloud/crypto';

/**
 * Everything the server is told comes from its environment, set by Claude
 * Desktop from the extension's settings (the passphrase is a "sensitive"
 * setting, which Claude Desktop keeps in the OS keychain) or by a launcher
 * script. Nothing here is ever written to disk or sent anywhere.
 */

/** The live app's sync service — public by design, like the web app's. */
export const DEFAULT_SYNC_URL = 'https://cxdskzmdglumpmhhbmyt.supabase.co';

export type McpConfig = {
  /** Where the encrypted files live. */
  home: string;
  passphrase: string | null;
  /** Sync service, or null for local-only. */
  cloud: CloudConfig | null;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const home =
    env.WORK_OPTIONAL_HOME && env.WORK_OPTIONAL_HOME.trim()
      ? path.resolve(env.WORK_OPTIONAL_HOME.trim())
      : path.join(os.homedir(), '.work-optional');
  const pass = env.WORK_OPTIONAL_PASSPHRASE ?? '';
  const key = (env.WORK_OPTIONAL_SYNC_KEY ?? '').trim();
  const url = (env.WORK_OPTIONAL_SYNC_URL ?? '').trim() || DEFAULT_SYNC_URL;
  return {
    home,
    passphrase: pass.length >= MIN_PASSPHRASE_LENGTH ? pass : null,
    // Same strict validation the web app applies (https, clean origin).
    cloud: key ? readCloudConfig(url, key, 'on') : null,
  };
}
