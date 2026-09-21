import { describe, expect, it } from 'vitest';

import { readCloudConfig } from './config';

describe('cloud config', () => {
  it('is off unless BOTH values are present', () => {
    expect(readCloudConfig(undefined, undefined)).toBeNull();
    expect(readCloudConfig('https://x.supabase.co', undefined)).toBeNull();
    expect(readCloudConfig(undefined, 'key')).toBeNull();
    expect(readCloudConfig('', '')).toBeNull();
  });

  it('accepts https only — this origin goes straight into the CSP', () => {
    expect(readCloudConfig('http://x.supabase.co', 'key')).toBeNull();
    expect(readCloudConfig('javascript:alert(1)', 'key')).toBeNull();
    expect(readCloudConfig('not a url', 'key')).toBeNull();
  });

  it('keeps the origin and drops anything that could smuggle CSP sources', () => {
    expect(readCloudConfig("https://x.supabase.co/path?q=1 'unsafe-inline' *", 'key')).toBeNull();
    expect(readCloudConfig('https://x.supabase.co/some/path?q=1', 'key')).toEqual({
      url: 'https://x.supabase.co',
      anonKey: 'key',
    });
  });

  it('refuses an absurd key', () => {
    expect(readCloudConfig('https://x.supabase.co', 'k'.repeat(2001))).toBeNull();
  });
});
