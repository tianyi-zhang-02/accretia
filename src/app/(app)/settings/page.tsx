import Link from 'next/link';

import { getAuthedUser } from '@/lib/supabase/server';

import SignOutButton from './sign-out-button';

type Item = { href: string; label: string; hint?: string };

const TRACKING: readonly Item[] = [
  { href: '/dashboard', label: 'Net-worth dashboard', hint: 'Snapshot-based overview + 12-month trend' },
  { href: '/accounts', label: 'Accounts', hint: 'Cash, savings, brokerage, retirement, crypto' },
  { href: '/portfolio', label: 'Portfolio', hint: 'Manual holdings with live quotes' },
  { href: '/transactions', label: 'Transactions', hint: 'Income, expenses, savings flows' },
  { href: '/goals', label: 'Savings goals', hint: 'Targets and projected completion' },
  { href: '/accounts/update', label: 'Update balances', hint: 'Bulk month-end snapshot' },
];

export default async function SettingsPage() {
  const user = await getAuthedUser();

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 pt-10">
      <header>
        <h1 className="serif-display text-3xl">Settings</h1>
        <p className="text-muted mt-2 text-sm">
          The app is projection-first — the{' '}
          <Link href="/" className="text-foreground underline-offset-4 hover:underline">
            wealth projection
          </Link>{' '}
          is the home screen. Manual tracking still lives here if you want it.
        </p>
      </header>

      <section className="space-y-2">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Data</p>
        <ul className="border-border divide-border divide-y rounded border">
          <li>
            <Link
              href="/settings/export"
              className="hover:bg-foreground/5 flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>Export data</span>
              <span className="text-muted text-xs">→</span>
            </Link>
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Tracking (optional)</p>
        <p className="text-muted text-[11px]">
          Manual net-worth and portfolio tracking. Optional — most of this is
          handled by a real brokerage now. Still here whenever you want it.
        </p>
        <ul className="border-border divide-border divide-y rounded border">
          {TRACKING.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="hover:bg-foreground/5 flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="block">{item.label}</span>
                  {item.hint ? (
                    <span className="text-muted mt-0.5 block text-[11px]">{item.hint}</span>
                  ) : null}
                </span>
                <span className="text-muted text-xs">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Account</p>
        <p className="text-sm">{user?.email}</p>
        <SignOutButton />
      </section>
    </main>
  );
}
