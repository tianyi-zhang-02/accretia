import { redirect } from 'next/navigation';

import { computeNetWorth } from '@/lib/derived/networth';
import { getServerSupabase, getAuthedUser } from '@/lib/supabase/server';
import type { Account } from '@/lib/types/account';
import type { Goal } from '@/lib/types/goal';

import GoalsClient, { type AccountBalanceMap } from './goals-client';

/**
 * Savings goals list. Reads goals + active accounts and pulls per-account
 * current balance from the canonical computeNetWorth helper so a linked
 * goal's progress reflects the same number the accounts list and the
 * dashboard hero show (snapshot if present, live-holdings fallback if not).
 */
export default async function GoalsPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  const supabase = await getServerSupabase();

  const [goalsRes, accountsRes, networth] = await Promise.all([
    supabase
      .from('savings_goals')
      .select(
        'id, user_id, name, target_amount, target_date, monthly_contribution, linked_account_id, created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('accounts')
      .select('id, user_id, name, type, currency, archived_at, created_at')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
    computeNetWorth(supabase, user.id),
  ]);

  if (goalsRes.error) console.warn('[goals page] goals error', { code: goalsRes.error.code });
  if (accountsRes.error)
    console.warn('[goals page] accounts error', { code: accountsRes.error.code });

  const goals: Goal[] = goalsRes.data ?? [];
  const accounts: Account[] = accountsRes.data ?? [];

  // Reduce the canonical breakdown to a { account_id → balance + source } map
  // for the client. Same shape /accounts uses, so the two screens always
  // agree on what an account is "worth" right now.
  const balanceMap: AccountBalanceMap = {};
  for (const b of networth.by_account) {
    balanceMap[b.account_id] = { value: b.value, source: b.source, as_of: b.as_of };
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-10">
      <header>
        <h1 className="serif-display text-3xl">Goals</h1>
        <p className="text-muted mt-2 text-sm">
          Targets and the path to hit them. Link a goal to a savings or brokerage account to track
          progress automatically.
        </p>
      </header>
      <GoalsClient initialGoals={goals} accounts={accounts} balanceMap={balanceMap} />
    </main>
  );
}
