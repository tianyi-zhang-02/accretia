import { describe, expect, it } from 'vitest';

import { readCloudConfig } from './config';

describe('cloud config', () => {
  // Regression: production carried SUPABASE variables left over from a
  // deleted backend, and inferring "enabled" from their presence switched
  // sync on against a dead project. Presence is not intent.
  it('stays OFF when valid-looking values are present but the switch is not', () => {
    const url = 'https://x.supabase.co';
    expect(readCloudConfig(url, 'key', undefined)).toBeNull();
    expect(readCloudConfig(url, 'key', '')).toBeNull();
    for (const almost of ['true', '1', 'ON', 'on ', 'yes', 'enabled']) {
      expect(readCloudConfig(url, 'key', almost)).toBeNull();
    }
    expect(readCloudConfig(url, 'key', 'on')).toEqual({ url, anonKey: 'key' });
  });

  it('is off unless BOTH values are present', () => {
    expect(readCloudConfig(undefined, undefined, 'on')).toBeNull();
    expect(readCloudConfig('https://x.supabase.co', undefined, 'on')).toBeNull();
    expect(readCloudConfig(undefined, 'key', 'on')).toBeNull();
    expect(readCloudConfig('', '', 'on')).toBeNull();
  });

  it('accepts https only — this origin goes straight into the CSP', () => {
    expect(readCloudConfig('http://x.supabase.co', 'key', 'on')).toBeNull();
    expect(readCloudConfig('javascript:alert(1)', 'key', 'on')).toBeNull();
    expect(readCloudConfig('not a url', 'key', 'on')).toBeNull();
  });

  it('keeps the origin and drops anything that could smuggle CSP sources', () => {
    expect(
      readCloudConfig("https://x.supabase.co/path?q=1 'unsafe-inline' *", 'key', 'on'),
    ).toBeNull();
    expect(readCloudConfig('https://x.supabase.co/some/path?q=1', 'key', 'on')).toEqual({
      url: 'https://x.supabase.co',
      anonKey: 'key',
    });
  });

  it('refuses an absurd key', () => {
    expect(readCloudConfig('https://x.supabase.co', 'k'.repeat(2001), 'on')).toBeNull();
  });
});
