import { redirect } from 'next/navigation';

import { getServerSupabase, getAuthedUser } from '@/lib/supabase/server';
import type { Account } from '@/lib/types/account';

import AccountsClient from './accounts-client';

/**
 * Accounts list. Server component reads via getServerSupabase (no client-side
 * Supabase, ever). Mutations go through /api/accounts and /api/accounts/:id;
 * the client component calls router.refresh() to repull this server data.
 */
export default async function AccountsPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('accounts')
    .select('id, user_id, name, type, currency, archived_at, created_at')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    // Don't leak the error string — log and render an empty/error state.
    console.warn('[accounts page] db error', { code: error.code });
  }

  const accounts: Account[] = data ?? [];

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-10">
      <header>
        <h1 className="serif-display text-3xl">Accounts</h1>
        <p className="text-muted mt-2 text-sm">
          Where your money sits — cash, savings, brokerage, retirement, crypto.
        </p>
      </header>

      <AccountsClient initialAccounts={accounts} />
    </main>
  );
}
