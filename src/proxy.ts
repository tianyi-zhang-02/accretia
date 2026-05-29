import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

/**
 * Next.js 16 proxy (the renamed `middleware`). Runs on every request that
 * matches `config.matcher`. Responsibilities:
 *   1. Refresh the Supabase session cookie when needed.
 *   2. Redirect unauthenticated users to /login (except for public paths).
 *   3. Redirect already-authenticated users away from /login.
 */

/**
 * Public routes are explicitly allowlisted by exact path to keep the
 * surface area tiny. The send/verify OTP routes must be reachable by
 * unauthenticated users — without them in this list, the proxy would
 * redirect their POST to /login (HTTP 307), the browser's fetch would
 * follow as a POST to /login, get a 200 HTML body back, and the client
 * would *think* it succeeded while Supabase was never called.
 *
 * Do NOT widen this to a `/api/auth/` prefix — that would open any
 * future auth route by default. Add new routes by name on purpose.
 *
 * /api/auth/signout intentionally stays gated; an unauthenticated POST
 * to it has nothing to sign out anyway.
 */
const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  // PWA install endpoints — iOS / Android launchers fetch these without
  // a Supabase session cookie. Redirecting them to /login would break
  // "Add to Home Screen" entirely.
  '/manifest.webmanifest',
  '/sw.js',
  '/icon',
  '/icon1',
  '/icon2',
  '/apple-icon',
]);
// /auth/confirm is the magic-link callback; unauth users must reach it.
const PUBLIC_PREFIXES = ['/auth/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Unauthenticated user trying to reach a protected page → /login
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve where they wanted to go so we can bounce back after auth.
    if (pathname !== '/') {
      url.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(url);
  }

  // Already-authenticated user hitting /login → home
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals, static assets, and the favicon.
  // API routes ARE included on purpose so the session cookie stays fresh.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
