import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { NextResponse } from 'next/server';

import { apiError } from '@/lib/api-error';
import { getServerSupabase } from '@/lib/supabase/server';

/**
 * Shared first line of every authenticated API route: ensure the request
 * has a verified session and return the user + a request-scoped Supabase
 * client. If unauthenticated, returns a 401 response that the caller
 * should immediately return.
 *
 *   const guard = await requireUser();
 *   if (!guard.ok) return guard.response;
 *   const { user, supabase } = guard;
 */
export async function requireUser(): Promise<
  { ok: true; user: User; supabase: SupabaseClient } | { ok: false; response: NextResponse }
> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, response: apiError.unauthorized() };
  }
  return { ok: true, user: data.user, supabase };
}
