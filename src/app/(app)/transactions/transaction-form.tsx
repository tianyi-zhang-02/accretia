'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { Account } from '@/lib/types/account';
import type { TransactionWithAccount } from '@/lib/types/transaction';
import {
  TRANSACTION_KINDS,
  createTransactionSchema,
  type CreateTransactionInput,
  type TransactionKind,
} from '@/lib/validation/transactions';

export const KIND_LABELS: Record<TransactionKind, string> = {
  income: 'Income',
  savings_deposit: 'Savings deposit',
  savings_withdrawal: 'Savings withdrawal',
  expense: 'Expense',
};

function todayIso(): string {
  // Local-time YYYY-MM-DD — using UTC here would tip days near midnight.
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type Props = {
  accounts: Account[];
  /** When provided, the form is in edit mode. */
  editing?: TransactionWithAccount;
  onCancel?: () => void;
  /** Called after a successful save. `isEdit` lets the caller toast differently. */
  onSaved: (isEdit: boolean) => void;
  /** Surfaces server-side or network errors to the caller. */
  onError?: (msg: string) => void;
};

export default function TransactionForm({ accounts, editing, onCancel, onSaved, onError }: Props) {
  const [categories, setCategories] = useState<string[]>([]);
  const isEdit = !!editing;

  // Fetch the user's prior categories for the datalist autocomplete.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/transactions/categories');
        if (!res.ok) return;
        const json = (await res.json()) as { categories: string[] };
        if (!cancelled) setCategories(json.categories ?? []);
      } catch {
        // Autocomplete is non-essential — silent fail is fine.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const form = useForm<CreateTransactionInput>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      account_id: editing?.account_id ?? accounts[0]?.id ?? '',
      kind: editing?.kind ?? 'expense',
      amount: editing ? Number(editing.amount) : 0,
      category: editing?.category ?? undefined,
      note: editing?.note ?? undefined,
      occurred_on: editing?.occurred_on ?? todayIso(),
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const endpoint = isEdit ? `/api/transactions/${editing.id}` : '/api/transactions';
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...values,
        // Send empty strings (not omit) so the server clears category/note on
        // edit when the user empties the field.
        category: values.category ?? '',
        note: values.note ?? '',
      }),
    });
    if (!res.ok) {
      onError?.(
        isEdit ? 'Could not save changes. Try again.' : 'Could not add transaction. Try again.',
      );
      return;
    }
    onSaved(isEdit);
  });

  if (accounts.length === 0) {
    return (
      <div className="border-border text-muted rounded border border-dashed p-4 text-sm">
        Add an account first — transactions need somewhere to live.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-border flex flex-col gap-3 rounded border p-4"
      noValidate
    >
      <p className="text-muted text-[11px] tracking-wide uppercase">
        {isEdit ? 'Edit transaction' : 'New transaction'}
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Amount</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          autoFocus
          className="border-border focus:border-foreground nums rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('amount', { valueAsNumber: true })}
        />
        {form.formState.errors.amount ? (
          <span className="text-negative text-xs">{form.formState.errors.amount.message}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Kind</span>
        <select
          className="border-border focus:border-foreground bg-background rounded border px-3 py-2 text-base outline-none"
          {...form.register('kind')}
        >
          {TRANSACTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Account</span>
        <select
          className="border-border focus:border-foreground bg-background rounded border px-3 py-2 text-base outline-none"
          {...form.register('account_id')}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Date</span>
        <input
          type="date"
          className="border-border focus:border-foreground bg-background nums rounded border px-3 py-2 text-base outline-none"
          {...form.register('occurred_on')}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Category (optional)</span>
        <input
          type="text"
          list="tx-categories"
          maxLength={60}
          autoComplete="off"
          placeholder="salary, groceries, rent…"
          className="border-border focus:border-foreground placeholder:text-muted/50 rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('category')}
        />
        <datalist id="tx-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Note (optional)</span>
        <textarea
          maxLength={500}
          rows={2}
          className="border-border focus:border-foreground rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('note')}
        />
      </label>

      <div className="mt-2 flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-muted hover:text-foreground rounded px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="bg-foreground text-background rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {form.formState.isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  );
}
