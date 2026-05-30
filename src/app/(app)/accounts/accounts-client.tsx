'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useToast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/format/money';
import {
  ACCOUNT_TYPES,
  createAccountSchema,
  type CreateAccountInput,
} from '@/lib/validation/accounts';
import type { Account } from '@/lib/types/account';

const TYPE_LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  cash: 'Cash',
  savings: 'Savings',
  brokerage: 'Brokerage',
  retirement: 'Retirement',
  crypto: 'Crypto',
  other: 'Other',
};

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; account: Account };

export type AccountBalanceMap = Record<
  string,
  { value: number; source: 'snapshot' | 'holdings' | 'none'; as_of: string | null }
>;

type Totals = { total: number; liquid: number; invested: number };

export default function AccountsClient({
  initialAccounts,
  balanceMap,
  totals,
}: {
  initialAccounts: Account[];
  balanceMap: AccountBalanceMap;
  totals: Totals;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  // Bottom-nav "+" sheet jumps here with ?add=1 to deep-link "Add account."
  // Initialise the form state from the URL on first render, then the effect
  // below strips the param so a refresh doesn't keep re-popping the form.
  const [mode, setMode] = useState<FormMode>(() =>
    searchParams.get('add') === '1' ? { kind: 'create' } : { kind: 'closed' },
  );
  const [pendingArchive, startArchive] = useTransition();

  useEffect(() => {
    if (searchParams.get('add') === '1') router.replace('/accounts');
  }, [searchParams, router]);

  function refresh() {
    router.refresh();
  }

  async function onArchive(account: Account) {
    if (!confirm(`Archive “${account.name}”? Historical data stays intact.`)) return;
    startArchive(async () => {
      const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not archive account. Try again.');
        return;
      }
      toast.success(`Archived ${account.name}.`);
      refresh();
    });
  }

  const hasAnyValue = Object.values(balanceMap).some((b) => b.source !== 'none');

  return (
    <div className="flex flex-col gap-4">
      {/* Total row at the top — sourced from the same canonical helper as
          the dashboard hero, so the two numbers always agree. */}
      {hasAnyValue ? (
        <section className="border-border rounded border p-4">
          <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Total</p>
          <p className="serif-display nums mt-1 text-2xl">{formatCurrency(totals.total)}</p>
          <p className="text-muted nums mt-1 text-[11px]">
            Liquid {formatCurrency(totals.liquid)} · Invested {formatCurrency(totals.invested)}
          </p>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-xs">
          {initialAccounts.length} account{initialAccounts.length === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          {initialAccounts.length > 0 ? (
            <Link
              href="/accounts/update"
              className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
            >
              Update balances
            </Link>
          ) : null}
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
      </div>

      {mode.kind !== 'closed' ? (
        <AccountForm
          mode={mode}
          onCancel={() => setMode({ kind: 'closed' })}
          onSaved={(name, isEdit) => {
            setMode({ kind: 'closed' });
            toast.success(isEdit ? `Updated ${name}.` : `Added ${name}.`);
            refresh();
          }}
          onError={toast.error}
        />
      ) : null}

      {initialAccounts.length === 0 ? (
        <div className="border-border text-muted rounded border border-dashed p-6 text-center text-sm">
          No accounts yet. Add one to start tracking.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {initialAccounts.map((account) => {
            const bal = balanceMap[account.id];
            return (
              <li
                key={account.id}
                className="border-border flex items-center justify-between gap-3 rounded border p-4"
              >
                <Link href={`/accounts/${account.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-base underline-offset-4 hover:underline">
                    {account.name}
                  </p>
                  <p className="text-muted mt-0.5 text-[11px] tracking-wide uppercase">
                    {TYPE_LABELS[account.type]} · {account.currency}
                    {bal?.source === 'holdings' ? ' · live holdings' : null}
                  </p>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="nums text-sm">
                    {bal && bal.source !== 'none'
                      ? formatCurrency(bal.value, { currency: account.currency })
                      : '—'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMode({ kind: 'edit', account })}
                      className="text-muted hover:text-foreground text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pendingArchive}
                      onClick={() => onArchive(account)}
                      className="text-muted hover:text-negative text-xs disabled:opacity-50"
                    >
                      Archive
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

function AccountForm({
  mode,
  onCancel,
  onSaved,
  onError,
}: {
  mode: Exclude<FormMode, { kind: 'closed' }>;
  onCancel: () => void;
  onSaved: (name: string, isEdit: boolean) => void;
  onError: (msg: string) => void;
}) {
  const editing = mode.kind === 'edit' ? mode.account : null;
  const form = useForm<CreateAccountInput>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      name: editing?.name ?? '',
      type: editing?.type ?? 'cash',
      currency: editing?.currency ?? 'USD',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (editing) {
      // Edit only updates name for now — type/currency stay locked to keep
      // historical snapshots consistent.
      const res = await fetch(`/api/accounts/${editing.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: values.name }),
      });
      if (!res.ok) {
        onError('Could not save changes. Try again.');
        return;
      }
      onSaved(values.name, true);
    } else {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        onError('Could not create account. Try again.');
        return;
      }
      onSaved(values.name, false);
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      className="border-border flex flex-col gap-3 rounded border p-4"
      noValidate
    >
      <p className="text-muted text-[11px] tracking-wide uppercase">
        {editing ? `Edit · ${TYPE_LABELS[editing.type]}` : 'New account'}
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Name</span>
        <input
          type="text"
          autoFocus
          maxLength={80}
          className="border-border focus:border-foreground rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('name')}
        />
      </label>

      {!editing ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-muted text-xs">Type</span>
            <select
              className="border-border focus:border-foreground bg-background rounded border px-3 py-2 text-base outline-none"
              {...form.register('type')}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted text-xs">Currency</span>
            <input
              type="text"
              maxLength={3}
              className="border-border focus:border-foreground w-24 rounded border bg-transparent px-3 py-2 text-base uppercase outline-none"
              {...form.register('currency')}
            />
          </label>
        </>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-muted hover:text-foreground rounded px-3 py-1.5 text-xs"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="bg-foreground text-background rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {form.formState.isSubmitting ? 'Saving…' : editing ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}
