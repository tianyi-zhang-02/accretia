import { NextResponse, type NextRequest } from 'next/server';

import { readCloudConfig } from '@/lib/cloud/config';

/**
 * Next.js 16 proxy (the renamed `middleware`). This app has no backend,
 * no database, and no auth — so the proxy's only job is to attach a
 * strict, per-request-nonce Content-Security-Policy to HTML responses.
 *
 * Static security headers (HSTS, X-Frame-Options, etc.) live in
 * `next.config.ts`.
 */

function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/**
 * Strict CSP. Since the app makes zero network calls of its own (no API,
 * no Supabase, no third-party requests), `connect-src` is just `'self'`
 * (needed for Next's dev HMR and prefetches). Dev relaxes `'unsafe-eval'`
 * (React's error overlay) and inline styles (HMR); production is strict.
 *
 * `style-src-attr 'unsafe-inline'` is the one documented escape hatch —
 * React + Recharts + our progress bars render `style={{ ... }}` JSX props,
 * which become inline `style="..."` attributes. It only permits per-element
 * style attributes (no document-level `<style>`, no external sheets, and
 * inline attributes cannot execute script).
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const cloudOrigin = readCloudConfig()?.url ?? null;
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ''}`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // 'self' only — plus the Supabase origin when (and only when) the
    // deployment has cloud sync configured. Never a wildcard.
    `connect-src 'self'${cloudOrigin ? ` ${cloudOrigin}` : ''}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only HTML documents need the CSP. Static install endpoints are served
  // as their own MIME types and don't execute scripts.
  const skip = pathname === '/sw.js' || pathname === '/manifest.webmanifest';
  if (skip) return NextResponse.next();

  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
