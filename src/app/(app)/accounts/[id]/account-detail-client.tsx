'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatDate } from '@/lib/format/money';
import type { Account } from '@/lib/types/account';
import type { Snapshot } from '@/lib/types/snapshot';
import type { TransactionKind } from '@/lib/validation/transactions';

const KIND_LABELS: Record<TransactionKind, string> = {
  income: 'Income',
  savings_deposit: 'Savings deposit',
  savings_withdrawal: 'Savings withdrawal',
  expense: 'Expense',
};
const SIGN: Record<TransactionKind, '+' | '−' | '↑' | '↓'> = {
  income: '+',
  expense: '−',
  savings_deposit: '↑',
  savings_withdrawal: '↓',
};
const TONE: Record<TransactionKind, string> = {
  income: 'text-positive',
  expense: 'text-negative',
  savings_deposit: 'text-muted',
  savings_withdrawal: 'text-muted',
};

function fmtMoneyHelper(n: number, currency: string): string {
  return formatCurrency(n, { currency, withCents: true });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


export default function AccountDetailClient({
  account,
  initialSnapshots,
  transactions,
}: {
  account: Account;
  initialSnapshots: Snapshot[];
  transactions: Array<{
    id: string;
    kind: TransactionKind;
    amount: string;
    category: string | null;
    occurred_on: string;
  }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [balance, setBalance] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, startDelete] = useTransition();

  const latest = initialSnapshots[0];

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(balance);
    if (!Number.isFinite(n)) {
      toast.error('Enter a valid number.');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account_id: account.id, balance: n, snapshot_date: date }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error('Could not save snapshot. Try again.');
      return;
    }
    toast.success('Snapshot saved.');
    setBalance('');
    setShowAdd(false);
    router.refresh();
  }

  async function onDelete(snapshotId: string) {
    if (!confirm('Delete this snapshot? Historical chart will recompute.')) return;
    startDelete(async () => {
      const res = await fetch(`/api/snapshots/${snapshotId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not delete snapshot. Try again.');
        return;
      }
      toast.success('Snapshot deleted.');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Current balance / latest snapshot */}
      <section>
        <p className="text-muted text-[11px] tracking-[0.2em] uppercase">Latest balance</p>
        {latest ? (
          <>
            <p className="serif-display nums mt-2 text-4xl">
              {fmtMoneyHelper(Number(latest.balance), account.currency)}
            </p>
            <p className="text-muted nums mt-1 text-xs">As of {formatDate(latest.snapshot_date)}</p>
          </>
        ) : (
          <p className="text-muted mt-2 text-sm">No snapshots yet.</p>
        )}
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="border-border hover:bg-foreground/5 mt-3 rounded border px-3 py-1.5 text-xs"
        >
          {showAdd ? 'Cancel' : '+ Add snapshot'}
        </button>
      </section>

      {/* Inline add-snapshot form */}
      {showAdd ? (
        <form onSubmit={onAdd} className="border-border flex flex-col gap-3 rounded border p-4">
          <label className="flex flex-col gap-1">
            <span className="text-muted text-xs">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-border bg-background nums rounded border px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted text-xs">Balance</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              autoFocus
              className="border-border focus:border-foreground nums rounded border bg-transparent px-3 py-2 text-base outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="bg-foreground text-background mt-1 self-end rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : null}

      {/* Snapshot history */}
      <section>
        <p className="text-muted mb-2 text-[11px] tracking-[0.2em] uppercase">
          Snapshot history ({initialSnapshots.length})
        </p>
        {initialSnapshots.length === 0 ? (
          <p className="border-border text-muted rounded border border-dashed p-4 text-center text-xs">
            No snapshots yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {initialSnapshots.map((s, i) => {
              const prev = initialSnapshots[i + 1];
              const delta = prev ? Number(s.balance) - Number(prev.balance) : 0;
              const deltaTone =
                !prev || delta === 0 ? 'text-muted' : delta > 0 ? 'text-positive' : 'text-negative';
              const deltaStr = !prev
                ? ''
                : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmtMoneyHelper(Math.abs(delta), account.currency)}`;
              return (
                <li
                  key={s.id}
                  className="border-border flex items-center justify-between gap-3 rounded border p-3"
                >
                  <div className="min-w-0">
                    <p className="nums text-sm">{fmtMoneyHelper(Number(s.balance), account.currency)}</p>
                    <p className="text-muted nums mt-0.5 text-[11px]">{formatDate(s.snapshot_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {deltaStr ? (
                      <span className={`nums text-[11px] ${deltaTone}`}>{deltaStr}</span>
                    ) : null}
                    <button
                      type="button"
                      disabled={pendingDelete}
                      onClick={() => onDelete(s.id)}
                      className="text-muted hover:text-negative text-[11px] disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recent transactions in this account */}
      <section>
        <p className="text-muted mb-2 text-[11px] tracking-[0.2em] uppercase">
          Recent transactions
        </p>
        {transactions.length === 0 ? (
          <p className="border-border text-muted rounded border border-dashed p-4 text-center text-xs">
            No transactions for this account yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="border-border flex items-center justify-between gap-3 rounded border p-3"
              >
                <div className="min-w-0">
                  <p className={`nums text-sm font-medium ${TONE[tx.kind]}`}>
                    {SIGN[tx.kind]} {fmtMoneyHelper(Number(tx.amount), account.currency)}
                  </p>
                  <p className="text-muted mt-0.5 truncate text-[10px] tracking-wide uppercase">
                    {KIND_LABELS[tx.kind]}
                    {tx.category ? ` · ${tx.category}` : ''}
                  </p>
                </div>
                <span className="text-muted nums shrink-0 text-[11px]">
                  {formatDate(tx.occurred_on)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
