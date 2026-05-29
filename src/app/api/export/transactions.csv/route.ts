import { apiError } from '@/lib/api-error';
import { requireUser } from '@/lib/api/require-user';
import { toCsv, todayIso } from '@/lib/export/csv';

/**
 * GET /api/export/transactions.csv
 *   Downloads every transaction the caller owns, joined with the account's
 *   name + type + currency, ordered by occurred_on ascending so the file
 *   reads chronologically.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.supabase
    .from('transactions')
    .select(
      'occurred_on, kind, amount, category, note, created_at, ' +
        'account:accounts(name, type, currency)',
    )
    .eq('user_id', guard.user.id)
    .order('occurred_on', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[GET /api/export/transactions.csv] db error', { code: error.code });
    return apiError.serverError();
  }

  type Row = {
    occurred_on: string;
    kind: string;
    amount: string;
    category: string | null;
    note: string | null;
    created_at: string;
    account: { name: string; type: string; currency: string } | null;
  };

  const rows = ((data ?? []) as unknown as Row[]).map((t) => [
    t.occurred_on,
    t.kind,
    t.amount,
    t.account?.currency ?? '',
    t.account?.name ?? '',
    t.account?.type ?? '',
    t.category ?? '',
    t.note ?? '',
    t.created_at,
  ]);

  const csv = toCsv(
    [
      'occurred_on',
      'kind',
      'amount',
      'currency',
      'account_name',
      'account_type',
      'category',
      'note',
      'created_at',
    ],
    rows,
  );

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="tracker-transactions-${todayIso()}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
