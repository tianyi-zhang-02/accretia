import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api-error';
import { requireUser } from '@/lib/api/require-user';
import { isAllowedOrigin } from '@/lib/security/origin';
import type { Account } from '@/lib/types/account';
import { createAccountSchema } from '@/lib/validation/accounts';

/**
 * GET /api/accounts?include=archived
 *   Lists the caller's accounts. By default hides archived rows; pass
 *   ?include=archived to include them.
 */
export async function GET(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const includeArchived = new URL(request.url).searchParams.get('include') === 'archived';

  let query = guard.supabase
    .from('accounts')
    .select('id, user_id, name, type, currency, archived_at, created_at')
    .eq('user_id', guard.user.id)
    .order('created_at', { ascending: true });

  if (!includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) {
    console.warn('[GET /api/accounts] db error', { code: error.code });
    return apiError.serverError();
  }

  return NextResponse.json({ accounts: data satisfies Account[] });
}

/**
 * POST /api/accounts
 *   Body: { name, type, currency? }
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return apiError.forbidden();

  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest();
  }

  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) return apiError.badRequest();

  const { data, error } = await guard.supabase
    .from('accounts')
    .insert({
      user_id: guard.user.id,
      name: parsed.data.name,
      type: parsed.data.type,
      currency: parsed.data.currency,
    })
    .select('id, user_id, name, type, currency, archived_at, created_at')
    .single();

  if (error) {
    console.warn('[POST /api/accounts] db error', { code: error.code });
    return apiError.serverError();
  }

  return NextResponse.json({ account: data satisfies Account }, { status: 201 });
}
