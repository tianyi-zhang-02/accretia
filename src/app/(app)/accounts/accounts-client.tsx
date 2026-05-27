'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

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

export default function AccountsClient({ initialAccounts }: { initialAccounts: Account[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<FormMode>({ kind: 'closed' });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingArchive, startArchive] = useTransition();

  function refresh() {
    router.refresh();
  }

  async function onArchive(account: Account) {
    if (!confirm(`Archive “${account.name}”? Historical data stays intact.`)) return;
    startArchive(async () => {
      const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setServerError('Could not archive account. Try again.');
        return;
      }
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted text-xs">
          {initialAccounts.length} account{initialAccounts.length === 1 ? '' : 's'}
        </p>
        {mode.kind === 'closed' ? (
          <button
            type="button"
            onClick={() => {
              setServerError(null);
              setMode({ kind: 'create' });
            }}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
          >
            + Add account
          </button>
        ) : null}
      </div>

      {mode.kind !== 'closed' ? (
        <AccountForm
          mode={mode}
          onCancel={() => setMode({ kind: 'closed' })}
          onSaved={() => {
            setMode({ kind: 'closed' });
            refresh();
          }}
          onError={setServerError}
        />
      ) : null}

      {serverError ? <p className="text-negative text-xs">{serverError}</p> : null}

      {initialAccounts.length === 0 ? (
        <div className="border-border text-muted rounded border border-dashed p-6 text-center text-sm">
          No accounts yet. Add one to start tracking.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {initialAccounts.map((account) => (
            <li
              key={account.id}
              className="border-border flex items-center justify-between rounded border p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-base">{account.name}</p>
                <p className="text-muted mt-0.5 text-[11px] tracking-wide uppercase">
                  {TYPE_LABELS[account.type]} · {account.currency}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setServerError(null);
                    setMode({ kind: 'edit', account });
                  }}
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
            </li>
          ))}
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
  onSaved: () => void;
  onError: (msg: string | null) => void;
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
    onError(null);

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
    }
    onSaved();
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
