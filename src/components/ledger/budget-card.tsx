'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { budgetTotal, suggestBudgets, type Budgets } from '@/lib/ledger/budgets';
import {
  CATEGORY_IDS,
  type CategoryId,
  type MonthEntry,
  type YearMonth,
} from '@/lib/ledger/ledger';

import { SectionLabel } from '../ui/icon';

/**
 * Monthly budgets per category. They live on the plan (so they travel with
 * backups and the encrypted vault) and are checked against logged months —
 * in the check-in, the findings and the year report. Collapsed until wanted.
 */
export default function BudgetCard({
  budgets,
  entries,
  today,
  planMonthlySpending,
  onChange,
}: {
  budgets: Budgets;
  entries: MonthEntry[];
  today: YearMonth;
  /** What the plan expects to be spent a month (incl. home costs), if known. */
  planMonthlySpending: number | null;
  onChange: (next: Budgets) => void;
}) {
  const { t, fmt } = useI18n();
  const B = t.track.budgets;
  const usual = useMemo(() => suggestBudgets(entries, today), [entries, today]);
  const set = Object.keys(budgets).filter((k) => (budgets[k as CategoryId] ?? 0) > 0).length;
  const [open, setOpen] = useState(false);
  // Drafts so a field can be cleared or half-typed without fighting the value.
  const [drafts, setDrafts] = useState<Partial<Record<CategoryId, string>>>({});
  const total = budgetTotal(budgets);

  function edit(id: CategoryId, raw: string) {
    setDrafts((d) => ({ ...d, [id]: raw }));
    const n = Number(raw.replace(/[$,\s]/g, ''));
    const next = { ...budgets };
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) delete next[id];
    else next[id] = Math.min(n, 1e9);
    onChange(next);
  }

  return (
    <section className="card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <SectionLabel icon="flag">{B.heading}</SectionLabel>
        <span className="text-muted flex items-center gap-2 text-xs">
          {set > 0 ? B.summary(set, fmt.currency0(total)) : B.none}
          <span aria-hidden>{open ? '−' : '+'}</span>
        </span>
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-muted text-xs">{B.hint}</p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {CATEGORY_IDS.map((id) => (
              <li key={id}>
                <label className="grid grid-cols-[1fr_7.5rem] items-center gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px]">{t.track.categories[id]}</span>
                    {usual[id] ? (
                      <span className="text-muted block truncate text-[11px]">
                        {B.usually(fmt.currency0(usual[id]!))}
                      </span>
                    ) : null}
                  </span>
                  <span className="relative">
                    <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="—"
                      value={drafts[id] ?? (budgets[id] ? String(budgets[id]) : '')}
                      onChange={(e) => edit(id, e.target.value)}
                      onBlur={() => setDrafts((d) => ({ ...d, [id]: undefined }))}
                      className="field field-money nums h-9 min-h-0 w-full text-right text-sm"
                    />
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <p className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-muted">{B.total}</span>
            <span className="nums">
              <span className="font-medium">{fmt.currency0(total)}</span>
              {planMonthlySpending ? (
                <span className="text-muted text-[11px]">
                  {' '}
                  · {B.planSays(fmt.currency0(planMonthlySpending))}
                </span>
              ) : null}
            </span>
          </p>

          <div className="flex flex-wrap gap-2">
            {CATEGORY_IDS.some((id) => usual[id] && !budgets[id]) ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDrafts({});
                  onChange({ ...usual, ...budgets });
                }}
              >
                {B.fillUsual}
              </button>
            ) : null}
            {set > 0 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setDrafts({});
                  onChange({});
                }}
              >
                {B.clearAll}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
