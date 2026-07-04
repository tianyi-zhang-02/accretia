import { redirect } from 'next/navigation';

import { getServerSupabase, getAuthedUser } from '@/lib/supabase/server';
import type { Scenario } from '@/lib/types/scenario';

import SimulatorClient from './simulator/simulator-client';

/**
 * Home = Wealth Projection Simulator.
 *
 * The app is projection-first: the simulator is the landing screen. The
 * simulation itself runs entirely client-side (pure math, instant); the
 * server's only jobs here are auth + loading saved scenarios so the
 * scenario selector has something to choose from.
 *
 * The old net-worth dashboard still exists at /dashboard, and the manual
 * tracking features (accounts, portfolio, transactions, snapshots, goals)
 * are still reachable via Settings — they're just no longer the primary
 * experience now that a real brokerage handles day-to-day tracking.
 *
 * `/simulator` redirects here so old links keep working.
 */
export default async function HomePage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, user_id, name, assumptions, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) console.warn('[home/simulator page] scenarios error', { code: error.code });

  return (
    <main className="flex flex-1 flex-col gap-4 px-6 pt-10">
      <header>
        <h1 className="serif-display text-3xl">Wealth projection</h1>
        <p className="text-muted mt-2 text-sm">
          Project household net worth across two careers, windfalls, major
          expenses, and investment-return bands. Estimates based on your
          assumptions — not a prediction or financial advice.
        </p>
      </header>
      <SimulatorClient initialScenarios={(data ?? []) as Scenario[]} />
    </main>
  );
}
