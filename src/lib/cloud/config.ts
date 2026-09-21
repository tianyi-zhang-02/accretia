/**
 * Cloud sync is OFF unless the deployment EXPLICITLY turns it on
 * (`NEXT_PUBLIC_CLOUD_SYNC=on`) AND provides both Supabase values.
 *
 * The explicit switch exists because presence alone is not intent: this
 * project's Vercel environment still carried SUPABASE variables from an
 * older, deleted backend, and inferring "enabled" from them switched the
 * feature on in production against a dead project. A stale variable must
 * never be able to change what the app does or what it promises.
 *
 * With sync off this is `null`, the account UI never renders, the Supabase
 * client is never loaded, and the CSP stays `connect-src 'self'` — the app
 * is exactly the local-only app it always was.
 *
 * Both values are public by design (the anon key is meant to ship to
 * browsers; row-level security is what protects the data), so they carry
 * the NEXT_PUBLIC_ prefix and are inlined at build time.
 */
export type CloudConfig = { url: string; anonKey: string };

export function readCloudConfig(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  flag: string | undefined = process.env.NEXT_PUBLIC_CLOUD_SYNC,
): CloudConfig | null {
  if (flag !== 'on') return null; // exact match — not "true", not "1", not "ON "
  if (!url || !anonKey || anonKey.length > 2_000) return null;
  // Fail closed on anything that isn't a clean URL. `new URL()` is forgiving
  // (it will happily percent-encode spaces and quotes), and this value ends
  // up inside a security header — a typo should disable sync, not get
  // "best-effort" parsed.
  if (/[\s'"`;,]/.test(url) || /\s/.test(anonKey)) return null;
  try {
    const u = new URL(url);
    // https only, and origin only — no path/query smuggled into the CSP.
    if (u.protocol !== 'https:') return null;
    if (!/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(u.origin)) return null;
    return { url: u.origin, anonKey };
  } catch {
    return null;
  }
}

export const CLOUD: CloudConfig | null = readCloudConfig();
