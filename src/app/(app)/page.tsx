import Link from 'next/link';
import { redirect } from 'next/navigation';

import NetWorthChart, { type ChartPoint } from '@/components/charts/net-worth-chart';
import { computeNetWorth } from '@/lib/derived/networth';
import { formatCurrency, formatDate } from '@/lib/format/money';
import { getServerSupabase, getAuthedUser } from '@/lib/supabase/server';
import type { TransactionKind } from '@/lib/validation/transactions';

import { KIND_LABELS } from './transactions/transaction-form';

const SIGN_BY_KIND: Record<TransactionKind, '+' | '−' | '↑' | '↓'> = {
  income: '+',
  expense: '−',
  savings_deposit: '↑',
  savings_withdrawal: '↓',
};
const TONE_BY_KIND: Record<TransactionKind, string> = {
  income: 'text-positive',
  expense: 'text-negative',
  savings_deposit: 'text-muted',
  savings_withdrawal: 'text-muted',
};

export default async function DashboardPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  const supabase = await getServerSupabase();

  // The canonical net-worth math lives in lib/derived/networth.ts now —
  // this page used to compute it inline (snapshots only). The shared
  // helper additionally fills in live-holdings value for accounts that
  // don't have a snapshot, while snapshots remain authoritative when
  // present so previously-verified dashboard numbers don't drift.
  const [networth, txsRes] = await Promise.all([
    computeNetWorth(supabase, user.id),
    supabase
      .from('transactions')
      .select('id, kind, amount, category, occurred_on, account:accounts(id, name, currency)')
      .eq('user_id', user.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  type RecentTx = {
    id: string;
    kind: TransactionKind;
    amount: string;
    category: string | null;
    occurred_on: string;
    account: { id: string; name: string; currency: string } | null;
  };
  const recentTx: RecentTx[] = (txsRes.data ?? []) as unknown as RecentTx[];

  const total = networth.current.total;
  const liquid = networth.current.liquid;
  const invested = networth.current.invested;
  const mostRecent = networth.current.as_of;
  const delta = networth.previous_month.delta;

  const chart: ChartPoint[] = networth.monthly.map((m) => ({
    month_end: m.month_end,
    total: m.total,
  }));

  const hasAnyValue = networth.by_account.some((a) => a.source !== 'none');
  const deltaSign = delta === 0 ? '' : delta > 0 ? '+' : '−';
  const deltaTone = delta === 0 ? 'text-muted' : delta > 0 ? 'text-positive' : 'text-negative';

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 pt-10">
      <header className="space-y-2">
        <p className="text-muted text-[11px] tracking-[0.2em] uppercase">Net worth</p>
        <p className="serif-display text-foreground nums text-5xl">
          {hasAnyValue ? formatCurrency(total) : '$ —'}
        </p>
        {hasAnyValue ? (
          <Link
            href="/transactions"
            className={`nums hover:underline-offset-4 hover:underline text-xs ${deltaTone}`}
          >
            {deltaSign} {formatCurrency(Math.abs(delta))} this month →
          </Link>
        ) : (
          <p className="text-muted text-xs">
            Add an account and a snapshot to populate this number.{' '}
            <Link href="/accounts" className="text-foreground underline-offset-4 hover:underline">
              Get started →
            </Link>
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Stat
          label="Liquid"
          value={hasAnyValue ? formatCurrency(liquid) : '$ —'}
          href="/accounts"
        />
        <Stat
          label="Invested"
          value={hasAnyValue ? formatCurrency(invested) : '$ —'}
          href="/portfolio"
        />
      </section>

      <section>
        <p className="text-muted mb-2 text-[11px] tracking-[0.2em] uppercase">12-month trend</p>
        <NetWorthChart data={chart} />
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between">
          <p className="text-muted text-[11px] tracking-[0.2em] uppercase">Recent activity</p>
          <Link href="/transactions" className="text-muted hover:text-foreground text-xs">
            View all →
          </Link>
        </div>
        {recentTx.length === 0 ? (
          <div className="border-border text-muted rounded border border-dashed p-4 text-center text-xs">
            No transactions yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentTx.map((tx) => {
              const amount = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: tx.account?.currency ?? 'USD',
                currencyDisplay: 'narrowSymbol',
                maximumFractionDigits: 2,
              }).format(Number(tx.amount));
              return (
                <li
                  key={tx.id}
                  className="border-border flex items-center justify-between gap-3 rounded border p-3"
                >
                  <div className="min-w-0">
                    <p className={`nums text-sm font-medium ${TONE_BY_KIND[tx.kind]}`}>
                      {SIGN_BY_KIND[tx.kind]} {amount}
                    </p>
                    <p className="text-muted mt-0.5 truncate text-[10px] tracking-wide uppercase">
                      {KIND_LABELS[tx.kind]} · {tx.account?.name ?? 'Unknown'}
                      {tx.category ? ` · ${tx.category}` : ''}
                    </p>
                  </div>
                  <span className="text-muted nums shrink-0 text-[11px]">
                    {formatDate(tx.occurred_on)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {mostRecent ? (
        <p className="text-muted text-[10px]">As of last snapshot · {formatDate(mostRecent)}</p>
      ) : null}
    </main>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="border-border hover:bg-foreground/5 rounded border p-4 transition-colors"
    >
      <p className="text-muted text-[10px] tracking-[0.18em] uppercase">{label} →</p>
      <p className="serif-display nums mt-2 text-2xl">{value}</p>
    </Link>
  );
}
