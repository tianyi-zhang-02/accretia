import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError } from '@/lib/api-error';
import { requireUser } from '@/lib/api/require-user';
import { isAllowedOrigin } from '@/lib/security/origin';
import type { Account } from '@/lib/types/account';
import { updateAccountSchema } from '@/lib/validation/accounts';

const idSchema = z.string().uuid();

/**
 * PATCH /api/accounts/:id
 *   Body: { name?, archived?: boolean } — set `archived: true` to soft-delete,
 *   `archived: false` to restore.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(request)) return apiError.forbidden();

  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const params = await ctx.params;
  if (!idSchema.safeParse(params.id).success) return apiError.badRequest();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest();
  }

  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) return apiError.badRequest();

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.archived !== undefined) {
    patch.archived_at = parsed.data.archived ? new Date().toISOString() : null;
  }

  const { data, error } = await guard.supabase
    .from('accounts')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', guard.user.id)
    .select('id, user_id, name, type, currency, archived_at, created_at')
    .single();

  if (error) {
    console.warn('[PATCH /api/accounts/:id] db error', { code: error.code });
    return apiError.serverError();
  }
  if (!data) return apiError.notFound();

  return NextResponse.json({ account: data satisfies Account });
}

/**
 * DELETE /api/accounts/:id
 *   Soft delete — sets archived_at = now(). Hard delete is intentionally not
 *   exposed: it would cascade and break historical net-worth snapshots.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(request)) return apiError.forbidden();

  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const params = await ctx.params;
  if (!idSchema.safeParse(params.id).success) return apiError.badRequest();

  const { error } = await guard.supabase
    .from('accounts')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', guard.user.id);

  if (error) {
    console.warn('[DELETE /api/accounts/:id] db error', { code: error.code });
    return apiError.serverError();
  }

  return NextResponse.json({ ok: true });
}
