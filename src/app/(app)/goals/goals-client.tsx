'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatMonthYear } from '@/lib/format/money';
import type { Account } from '@/lib/types/account';
import type { Goal } from '@/lib/types/goal';
import { createGoalSchema, type CreateGoalInput } from '@/lib/validation/goals';

export type AccountBalanceMap = Record<
  string,
  { value: number; source: 'snapshot' | 'holdings' | 'none'; as_of: string | null }
>;

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; goal: Goal };

function addMonthsIso(months: number): string {
  // Today + N months, returned as YYYY-MM-DD.
  const d = new Date();
  d.setMonth(d.getMonth() + Math.max(0, months));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Projection =
  | { kind: 'met' }
  | { kind: 'no-contrib' }
  | { kind: 'months'; months: number; iso: string }
  | { kind: 'no-account' };

function project(goal: Goal, currentBalance: number | null): Projection {
  if (currentBalance === null) return { kind: 'no-account' };
  const target = Number(goal.target_amount);
  if (currentBalance >= target) return { kind: 'met' };
  const monthly = Number(goal.monthly_contribution);
  if (monthly <= 0) return { kind: 'no-contrib' };
  const months = Math.ceil((target - currentBalance) / monthly);
  return { kind: 'months', months, iso: addMonthsIso(months) };
}

export default function GoalsClient({
  initialGoals,
  accounts,
  balanceMap,
}: {
  initialGoals: Goal[];
  accounts: Account[];
  balanceMap: AccountBalanceMap;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<FormMode>({ kind: 'closed' });
  const [pendingDelete, startDelete] = useTransition();

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  function refresh() {
    router.refresh();
  }

  async function onDelete(goal: Goal) {
    if (!confirm(`Delete goal “${goal.name}”? This can't be undone.`)) return;
    startDelete(async () => {
      const res = await fetch(`/api/goals/${goal.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not delete. Try again.');
        return;
      }
      toast.success(`Deleted ${goal.name}.`);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted text-xs">
          {initialGoals.length} goal{initialGoals.length === 1 ? '' : 's'}
        </p>
        {mode.kind === 'closed' ? (
          <button
            type="button"
            onClick={() => setMode({ kind: 'create' })}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
          >
            + Add goal
          </button>
        ) : null}
      </div>

      {mode.kind !== 'closed' ? (
        <GoalForm
          mode={mode}
          accounts={accounts}
          onCancel={() => setMode({ kind: 'closed' })}
          onSaved={(isEdit) => {
            setMode({ kind: 'closed' });
            toast.success(isEdit ? 'Goal saved.' : 'Goal added.');
            refresh();
          }}
          onError={toast.error}
        />
      ) : null}

      {initialGoals.length === 0 ? (
        <div className="border-border text-muted rounded border border-dashed p-6 text-center text-sm">
          No goals yet. Set one to give your savings a finish line.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {initialGoals.map((goal) => {
            const account = goal.linked_account_id ? accountById.get(goal.linked_account_id) : null;
            const currency = account?.currency ?? 'USD';
            const target = Number(goal.target_amount);
            const monthly = Number(goal.monthly_contribution);
            // Live per-account balance pulled from the canonical helper —
            // identical to what the accounts list and dashboard show.
            const bal = goal.linked_account_id ? balanceMap[goal.linked_account_id] : undefined;
            const current = bal && bal.source !== 'none' ? bal.value : null;
            const pct =
              current !== null && target > 0
                ? Math.max(0, Math.min(100, (current / target) * 100))
                : 0;
            const projection = project(goal, current);

            return (
              <li key={goal.id} className="border-border rounded border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="serif-display text-xl">{goal.name}</p>
                    <p className="text-muted mt-1 text-[11px] tracking-wide uppercase">
                      {account ? (
                        <Link
                          href={`/accounts/${account.id}`}
                          className="hover:text-foreground"
                        >
                          Linked · {account.name} ↗
                        </Link>
                      ) : (
                        'No linked account'
                      )}
                      {goal.target_date ? ` · target ${formatMonthYear(goal.target_date)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode({ kind: 'edit', goal })}
                      className="text-muted hover:text-foreground text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pendingDelete}
                      onClick={() => onDelete(goal)}
                      className="text-muted hover:text-negative text-xs disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Progress */}
                {current !== null ? (
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="serif-display nums text-2xl">{formatCurrency(current, { currency })}</p>
                      <p className="text-muted nums text-xs">
                        of {formatCurrency(target, { currency })} · {pct.toFixed(0)}%
                      </p>
                    </div>
                    <div className="border-border bg-border/30 mt-2 h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-accent h-full"
                        style={{ width: `${pct}%` }}
                        aria-label={`${pct.toFixed(0)}% complete`}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-muted nums mt-3 text-sm">
                    Target {formatCurrency(target, { currency })}
                  </p>
                )}

                {/* Footer line — monthly contribution + projection */}
                <p className="text-muted mt-3 text-xs">
                  {monthly > 0 ? (
                    <>
                      <span className="nums">{formatCurrency(monthly, { currency })}</span>/mo
                    </>
                  ) : (
                    'No monthly contribution set'
                  )}
                  {' · '}
                  <ProjectionLabel projection={projection} currency={currency} />
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProjectionLabel({ projection, currency }: { projection: Projection; currency: string }) {
  void currency; // present for future use (e.g. shortfall display)
  switch (projection.kind) {
    case 'met':
      return <span className="text-positive">Goal met</span>;
    case 'no-contrib':
      return <span>Set a monthly contribution to project</span>;
    case 'no-account':
      return <span>Link an account to track progress</span>;
    case 'months':
      return (
        <span>
          {projection.months} mo · ~{formatMonthYear(projection.iso)}
        </span>
      );
  }
}

function GoalForm({
  mode,
  accounts,
  onCancel,
  onSaved,
  onError,
}: {
  mode: Exclude<FormMode, { kind: 'closed' }>;
  accounts: Account[];
  onCancel: () => void;
  onSaved: (isEdit: boolean) => void;
  onError: (msg: string) => void;
}) {
  const editing = mode.kind === 'edit' ? mode.goal : null;
  const isEdit = !!editing;

  const form = useForm<CreateGoalInput>({
    resolver: zodResolver(createGoalSchema),
    defaultValues: {
      name: editing?.name ?? '',
      target_amount: editing ? Number(editing.target_amount) : 0,
      target_date: editing?.target_date ?? undefined,
      monthly_contribution: editing ? Number(editing.monthly_contribution) : 0,
      linked_account_id: editing?.linked_account_id ?? undefined,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    // Send empty strings (not omit) for optional clear-able fields so the
    // PATCH endpoint knows the user intends to clear them on edit.
    const body = {
      ...values,
      target_date: values.target_date ?? '',
      linked_account_id: values.linked_account_id ?? '',
    };

    const endpoint = isEdit ? `/api/goals/${editing.id}` : '/api/goals';
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      onError(isEdit ? 'Could not save changes. Try again.' : 'Could not create goal. Try again.');
      return;
    }
    onSaved(isEdit);
  });

  return (
    <form
      onSubmit={onSubmit}
      className="border-border flex flex-col gap-3 rounded border p-4"
      noValidate
    >
      <p className="text-muted text-[11px] tracking-wide uppercase">
        {isEdit ? 'Edit goal' : 'New goal'}
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Name</span>
        <input
          type="text"
          autoFocus
          maxLength={80}
          placeholder="Emergency fund, House down payment…"
          className="border-border focus:border-foreground placeholder:text-muted/50 rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('name')}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Target amount</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          className="border-border focus:border-foreground nums rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('target_amount', { valueAsNumber: true })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Target date (optional)</span>
        <input
          type="date"
          className="border-border focus:border-foreground bg-background nums rounded border px-3 py-2 text-base outline-none"
          {...form.register('target_date')}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Monthly contribution</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          className="border-border focus:border-foreground nums rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('monthly_contribution', { valueAsNumber: true })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Linked account (optional)</span>
        <select
          className="border-border focus:border-foreground bg-background rounded border px-3 py-2 text-base outline-none"
          {...form.register('linked_account_id')}
        >
          <option value="">(none — track manually)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency}
            </option>
          ))}
        </select>
      </label>

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
          {form.formState.isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}
