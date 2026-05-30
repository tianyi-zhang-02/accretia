import { redirect } from 'next/navigation';

import { computeNetWorth } from '@/lib/derived/networth';
import { getServerSupabase, getAuthedUser } from '@/lib/supabase/server';
import type { Account } from '@/lib/types/account';

import AccountsClient, { type AccountBalanceMap } from './accounts-client';

/**
 * Accounts list. Pulls both the raw account rows (for CRUD) and the
 * canonical per-account balance from the shared net-worth helper so
 * every row's "current balance" matches the dashboard and the goals
 * progress numbers byte-for-byte.
 */
export default async function AccountsPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  const supabase = await getServerSupabase();
  const [accountsRes, networth] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, user_id, name, type, currency, archived_at, created_at')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
    computeNetWorth(supabase, user.id),
  ]);

  if (accountsRes.error) {
    console.warn('[accounts page] db error', { code: accountsRes.error.code });
  }

  const accounts: Account[] = accountsRes.data ?? [];

  // Reduce the canonical breakdown to a { account_id → balance + source }
  // map the client component can index per row.
  const balanceMap: AccountBalanceMap = {};
  for (const b of networth.by_account) {
    balanceMap[b.account_id] = { value: b.value, source: b.source, as_of: b.as_of };
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-10">
      <header>
        <h1 className="serif-display text-3xl">Accounts</h1>
        <p className="text-muted mt-2 text-sm">
          Where your money sits — cash, savings, brokerage, retirement, crypto.
        </p>
      </header>

      <AccountsClient
        initialAccounts={accounts}
        balanceMap={balanceMap}
        totals={{
          total: networth.current.total,
          liquid: networth.current.liquid,
          invested: networth.current.invested,
        }}
      />
    </main>
  );
}
