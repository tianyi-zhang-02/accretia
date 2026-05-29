import { apiError } from '@/lib/api-error';
import { requireUser } from '@/lib/api/require-user';
import { todayIso } from '@/lib/export/csv';

/**
 * GET /api/export/backup.json
 *   Full export of every user-authored row across the schema. The
 *   "your data is yours" escape hatch — restoring is out of scope (no
 *   official importer), but the JSON is structured so a future importer
 *   could round-trip it.
 *
 *   Server-only stuff (price_cache) is deliberately NOT included; it's
 *   not the user's data, and exposing it would tip a hostile reader off
 *   to internal cache state.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const tables = ['accounts', 'transactions', 'account_snapshots', 'savings_goals', 'holdings', 'scenarios', 'user_settings'] as const;

  const results = await Promise.all(
    tables.map((t) =>
      guard.supabase.from(t).select('*').eq('user_id', guard.user.id),
    ),
  );

  for (let i = 0; i < results.length; i += 1) {
    const r = results[i]!;
    if (r.error) {
      console.warn(`[GET /api/export/backup.json] ${tables[i]} error`, { code: r.error.code });
      return apiError.serverError();
    }
  }

  const payload = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    user_id: guard.user.id,
    user_email: guard.user.email,
    data: Object.fromEntries(
      tables.map((t, i) => [t, results[i]!.data ?? []]),
    ),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="tracker-backup-${todayIso()}.json"`,
      'cache-control': 'private, no-store',
    },
  });
}
