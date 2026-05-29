import Link from 'next/link';

import { getAuthedUser } from '@/lib/supabase/server';

import SignOutButton from './sign-out-button';

export default async function SettingsPage() {
  const user = await getAuthedUser();

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 pt-10">
      <header>
        <h1 className="serif-display text-3xl">Settings</h1>
        <p className="text-muted mt-2 text-sm">
          Sections that don&apos;t live in the bottom nav, plus data export
          and the sign-out control.
        </p>
      </header>

      {/* Discovery for pages that aren't in the bottom nav. */}
      <section className="space-y-2">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Sections</p>
        <ul className="border-border divide-border divide-y rounded border">
          <li>
            <Link
              href="/goals"
              className="hover:bg-foreground/5 flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>Savings goals</span>
              <span className="text-muted text-xs">→</span>
            </Link>
          </li>
          <li>
            <Link
              href="/simulator"
              className="hover:bg-foreground/5 flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>Wealth simulator</span>
              <span className="text-muted text-xs">→</span>
            </Link>
          </li>
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
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Account</p>
        <p className="text-sm">{user?.email}</p>
        <SignOutButton />
      </section>
    </main>
  );
}
