import { apiError } from '@/lib/api-error';
import { requireUser } from '@/lib/api/require-user';
import { toCsv, todayIso } from '@/lib/export/csv';

/**
 * GET /api/export/holdings.csv
 *   Holdings, joined with the account they sit in.
 *   Note: live market prices are NOT included here — they're rate-limited
 *   and not the user's authored data. A future enhancement could surface
 *   the most recent cached price from price_cache, but that's neither
 *   the user's input nor under their control.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.supabase
    .from('holdings')
    .select(
      'symbol, asset_type, quantity, cost_basis, created_at, ' +
        'account:accounts(name, type, currency)',
    )
    .eq('user_id', guard.user.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[GET /api/export/holdings.csv] db error', { code: error.code });
    return apiError.serverError();
  }

  type Row = {
    symbol: string;
    asset_type: string;
    quantity: string;
    cost_basis: string;
    created_at: string;
    account: { name: string; type: string; currency: string } | null;
  };

  const rows = ((data ?? []) as unknown as Row[]).map((h) => [
    h.account?.name ?? '',
    h.account?.type ?? '',
    h.account?.currency ?? '',
    h.symbol,
    h.asset_type,
    h.quantity,
    h.cost_basis,
    h.created_at,
  ]);

  const csv = toCsv(
    [
      'account_name',
      'account_type',
      'account_currency',
      'symbol',
      'asset_type',
      'quantity',
      'cost_basis',
      'created_at',
    ],
    rows,
  );

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="tracker-holdings-${todayIso()}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
