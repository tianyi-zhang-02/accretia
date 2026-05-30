import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api-error';
import { requireUser } from '@/lib/api/require-user';
import { computeNetWorth } from '@/lib/derived/networth';

/**
 * GET /api/networth
 *   Thin adapter over the canonical computeNetWorth helper. The same
 *   helper is imported directly by server components that don't need to
 *   round-trip through HTTP (the dashboard and the accounts list).
 *
 *   Returned shape (kept stable for the simulator's "Use my actual data"
 *   prefill that already calls this route):
 *     {
 *       current:        { total, liquid, invested, as_of },
 *       previous_month: { as_of, total, delta },
 *       monthly:        [{ month_end, total }, …],
 *       by_account:     [{ account_id, name, type, currency, source, value, as_of }, …]
 *     }
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  try {
    const result = await computeNetWorth(guard.supabase, guard.user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.warn('[GET /api/networth] compute error', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return apiError.serverError();
  }
}
