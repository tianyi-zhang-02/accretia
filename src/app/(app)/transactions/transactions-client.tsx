'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatDate } from '@/lib/format/money';
import type { Account } from '@/lib/types/account';
import type { TransactionWithAccount } from '@/lib/types/transaction';
import { TRANSACTION_KINDS, type TransactionKind } from '@/lib/validation/transactions';

import TransactionForm, { KIND_LABELS } from './transaction-form';

type FormMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; transaction: TransactionWithAccount };

type Filters = {
  account: string | 'all';
  kind: TransactionKind | 'all';
};

const SIGN_BY_KIND: Record<
  TransactionKind,
  { sign: '+' | '−' | '↑' | '↓'; tone: 'positive' | 'negative' | 'muted' }
> = {
  income: { sign: '+', tone: 'positive' },
  expense: { sign: '−', tone: 'negative' },
  savings_deposit: { sign: '↑', tone: 'muted' },
  savings_withdrawal: { sign: '↓', tone: 'muted' },
};

function formatAmount(amount: string, currency: string): string {
  const n = Number(amount);
  return formatCurrency(n, { currency, withCents: true });
}

export default function TransactionsClient({
  initialTransactions,
  accounts,
}: {
  initialTransactions: TransactionWithAccount[];
  accounts: Account[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<FormMode>({ kind: 'closed' });
  const [filters, setFilters] = useState<Filters>({ account: 'all', kind: 'all' });
  const [showFilters, setShowFilters] = useState(false);
  const [pendingDelete, startDelete] = useTransition();

  function refresh() {
    router.refresh();
  }

  const visible = useMemo(
    () =>
      initialTransactions.filter((tx) => {
        if (filters.account !== 'all' && tx.account_id !== filters.account) return false;
        if (filters.kind !== 'all' && tx.kind !== filters.kind) return false;
        return true;
      }),
    [initialTransactions, filters],
  );

  async function onDelete(tx: TransactionWithAccount) {
    if (!confirm(`Delete this ${KIND_LABELS[tx.kind].toLowerCase()}? This can't be undone.`))
      return;
    startDelete(async () => {
      const res = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not delete. Try again.');
        return;
      }
      toast.success('Transaction deleted.');
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="text-muted hover:text-foreground text-xs"
        >
          {showFilters ? 'Hide filters' : 'Filters'}
        </button>
        <p className="text-muted text-xs">
          {visible.length} of {initialTransactions.length}
        </p>
        {mode.kind === 'closed' ? (
          <button
            type="button"
            onClick={() => setMode({ kind: 'create' })}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
          >
            + Add
          </button>
        ) : null}
      </div>

      {showFilters ? (
        <div className="border-border flex flex-col gap-3 rounded border p-3">
          <label className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted">Account</span>
            <select
              className="border-border bg-background rounded border px-2 py-1 text-xs"
              value={filters.account}
              onChange={(e) => setFilters((f) => ({ ...f, account: e.target.value }))}
            >
              <option value="all">All</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted">Kind</span>
            <select
              className="border-border bg-background rounded border px-2 py-1 text-xs"
              value={filters.kind}
              onChange={(e) =>
                setFilters((f) => ({ ...f, kind: e.target.value as Filters['kind'] }))
              }
            >
              <option value="all">All</option>
              {TRANSACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {mode.kind !== 'closed' ? (
        <TransactionForm
          accounts={accounts}
          editing={mode.kind === 'edit' ? mode.transaction : undefined}
          onCancel={() => setMode({ kind: 'closed' })}
          onSaved={(isEdit) => {
            setMode({ kind: 'closed' });
            toast.success(isEdit ? 'Transaction saved.' : 'Transaction added.');
            refresh();
          }}
          onError={toast.error}
        />
      ) : null}

      {visible.length === 0 ? (
        <div className="border-border text-muted rounded border border-dashed p-6 text-center text-sm">
          {initialTransactions.length === 0
            ? 'No transactions yet. Add one to start tracking activity.'
            : 'No transactions match the current filters.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((tx) => {
            const sign = SIGN_BY_KIND[tx.kind];
            const currency = tx.account?.currency ?? 'USD';
            const amountStr = formatAmount(tx.amount, currency);
            const toneClass =
              sign.tone === 'positive'
                ? 'text-positive'
                : sign.tone === 'negative'
                  ? 'text-negative'
                  : 'text-muted';
            return (
              <li
                key={tx.id}
                className="border-border flex items-start justify-between gap-3 rounded border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`nums text-sm font-medium ${toneClass}`}>
                      {sign.sign} {amountStr}
                    </span>
                  </div>
                  <p className="text-muted mt-1 truncate text-[11px] tracking-wide uppercase">
                    {KIND_LABELS[tx.kind]} · {tx.account?.name ?? 'Unknown'}
                    {tx.category ? ` · ${tx.category}` : ''}
                  </p>
                  {tx.note ? <p className="text-muted mt-1 truncate text-xs">{tx.note}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-muted nums text-[11px]">{formatDate(tx.occurred_on)}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMode({ kind: 'edit', transaction: tx })}
                      className="text-muted hover:text-foreground text-[11px]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pendingDelete}
                      onClick={() => onDelete(tx)}
                      className="text-muted hover:text-negative text-[11px] disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
