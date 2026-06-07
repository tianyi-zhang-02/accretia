# Migrations

Apply these against your Supabase project in numerical order, **after**
running `../schema.sql`. Each file is idempotent (uses `if exists` / `if not
exists` / `drop policy if exists`), so re-running is safe.

## Apply order

1. **`0001_scenarios.sql`** — Adds the `scenarios` table for the wealth
   simulator (Step 10). Scoped by `auth.uid() = user_id` RLS.

   > **Fresh setup note:** `schema.sql` already contains the `scenarios`
   > table from Step 10 onward, so re-running this migration on a new
   > project is a no-op. Keep the file as a historical record — if a
   > self-hoster forked the repo between Step 9 and Step 10 they'd need
   > this to catch up.

2. **`0002_revoke_rls_auto_enable_grants.sql`** — Restricts the
   Supabase-auto-installed `public.rls_auto_enable()` SECURITY DEFINER
   helper to `service_role` only. Closes Supabase Security Advisor
   warnings #1 and #2 from Step 13. Wrapped in a `DO` block that no-ops
   if the helper isn't present on the project, so it's safe to run on a
   fresh setup.

   > **Mandatory for self-hosters.** Without this, an authenticated user
   > could call a SECURITY DEFINER function and gain elevated privileges.
   > Run it.

3. **`0003_holding_lots.sql`** — Adds `public.holding_lots` (RLS, owner-
   only policy) for tax-lot accounting (Phase 4). Backfills one lot per
   existing holding with `acquired_on = holdings.created_at::date` and
   `acquired_on_estimated = true` so the UI can render it as a
   placeholder until the user supplies a real acquisition date.

4. **`0004_user_settings_tax_rates.sql`** — Adds
   `effective_lt_tax_rate_pct` and `effective_st_tax_rate_pct` columns
   to `public.user_settings` for the per-lot hypothetical-sale estimate
   (Phase 4 part 2). Both default to 0; the UI hides tax estimates
   until both are positive. Safe on populated DBs — existing
   `user_settings` rows just get the default values for the new
   columns. No backfill needed.

   > **Safe to run with no precondition.** Pure column additions with
   > defaults. No safety check / rollback-test sibling needed.

   > **Take an encrypted backup from /settings/export before applying
   > this migration.** Per project rule, migrations are forward-only and
   > the only safe rollback is restoring from a backup.

   The migration is wrapped in an explicit `begin; ... commit;` block
   with a transactional safety check at the end: it raises an exception
   if any holding's lot sums don't equal the holding total to the cent,
   which rolls back the entire transaction. **You cannot end up in a
   half-applied state.** Re-running the migration is a no-op (the
   backfill skips holdings that already have at least one lot).

## Adding a new migration

- Name: `NNNN_short_description.sql` where `NNNN` is the next zero-padded
  number (`0003_...`, `0004_...`).
- **Forward-only.** Other self-hosters will run this against real data —
  no destructive operations without an explicit `-- WARNING:` comment and
  a sentence in `CHANGELOG.md` explaining how to roll back if needed.
- **Idempotent.** Use `if (not) exists`, `drop policy if exists`,
  `create or replace function`, etc. Re-running must be a no-op.
- **RLS first.** Any new user-owned table must `enable row level
  security` and add the `auth.uid() = user_id` policy in the same
  migration.
- Update `schema.sql` in the same PR so a fresh setup gets the new
  state in one run. The migration file is for upgrade paths; `schema.sql`
  is for fresh.
- **If the migration ships a transactional safety check** (a `do $$`
  block that raises on a precondition violation, like `0003`'s lot-sum
  verification), include a sibling `NNNN_xxx.rollback-test.mjs` that
  exercises the check against pglite with at least one GOOD case and
  one BAD case. Extend the `test:migrations` npm script to invoke it.
  The pattern is set by `0003_holding_lots.rollback-test.mjs`.

## How to apply

Supabase dashboard → **SQL Editor** → paste the file contents → **Run**.
The output should be "Success. No rows returned." or similar — no errors.

For automated environments, the same SQL runs via `supabase db push` or
the Supabase CLI's migration tooling; the dashboard route is the
simplest for a personal project.
