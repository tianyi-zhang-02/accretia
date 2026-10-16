'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import {
  ANNUAL_SUGGESTIONS,
  MAX_ANNUAL,
  annualTotal,
  monthlyReserve,
  upcoming,
  type AnnualExpense,
} from '@/lib/ledger/annual';
import { CATEGORY_IDS, shiftMonth, subsOf, type SubId, type YearMonth } from '@/lib/ledger/ledger';

import { SectionLabel } from '../ui/icon';

/**
 * Once-a-year bills: what they add up to, what to put aside each month and
 * what's coming. Stored on the plan (`annualExpenses`); the projection is
 * untouched — its yearly spending already includes them.
 */
export default function AnnualCard({
  annual,
  today,
  onChange,
  embedded = false,
  notify,
}: {
  annual: AnnualExpense[];
  today: YearMonth;
  onChange: (next: AnnualExpense[]) => void;
  /** Inside the Budgets & goals card: just the content, no card or header. */
  embedded?: boolean;
  /** Undoable removals: a toast with Undo, as for clearing a month. */
  notify?: (text: string, undo?: () => void) => void;
}) {
  const { t, fmt, locale } = useI18n();
  const A = t.track.annual;
  const [open, setOpen] = useState(false);
  // Drafts keep a half-typed amount from fighting the stored number.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const total = annualTotal(annual);
  const next = useMemo(() => upcoming(annual, today), [annual, today]);
  const monthName = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' });
    return (m: number) => f.format(new Date(2000, m - 1, 1));
  }, [locale]);
  const label = (id: SubId) => t.track.subcategories[id];
  const away = (n: number) => (n === 0 ? A.thisMonth : n === 1 ? A.nextMonth : A.inMonths(n));

  const set = (i: number, patch: Partial<AnnualExpense>) =>
    onChange(annual.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  function add(item: SubId) {
    if (annual.length >= MAX_ANNUAL) return;
    onChange([...annual, { item, amount: 0, month: shiftMonth(today, 1).month }]);
    setOpen(true);
  }
  function remove(i: number) {
    const before = annual;
    setDrafts({});
    onChange(annual.filter((_, j) => j !== i));
    notify?.(t.toast.removed(label(annual[i]!.item)), () => onChange(before));
  }
  const suggestions = ANNUAL_SUGGESTIONS.filter((id) => !annual.some((x) => x.item === id));

  const body = (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-xs">{A.hint}</p>

      {next.length ? (
        <div>
          <p className="eyebrow mb-1">{A.upcomingLabel}</p>
          <ul className="rows">
            {next.map((x, i) => (
              <li key={i} className="row items-center">
                <span className="text-[13px]">
                  {label(x.item)}
                  <span className="text-muted block text-[11px]">
                    {monthName(x.month)} · {away(x.monthsAway)}
                  </span>
                </span>
                <span className="nums text-[13px] font-medium">{fmt.currency0(x.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {annual.length ? (
        <ul className="flex flex-col gap-3">
          {annual.map((x, i) => (
            <li
              key={i}
              className="grid grid-cols-[5.5rem_1fr_2.25rem] items-center gap-2 sm:grid-cols-[1fr_5.5rem_8rem_2.25rem]"
            >
              <select
                aria-label={A.item}
                value={x.item}
                onChange={(e) => set(i, { item: e.target.value as SubId })}
                className="field col-span-3 h-9 min-h-0 text-sm sm:col-span-1"
              >
                {CATEGORY_IDS.map((c) => (
                  <optgroup key={c} label={t.track.categories[c]}>
                    {subsOf(c).map((id) => (
                      <option key={id} value={id}>
                        {label(id)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                aria-label={A.month}
                value={x.month}
                onChange={(e) => set(i, { month: Number(e.target.value) })}
                className="field h-9 min-h-0 text-sm"
              >
                {Array.from({ length: 12 }, (_, m) => (
                  <option key={m} value={m + 1}>
                    {monthName(m + 1)}
                  </option>
                ))}
              </select>
              <span className="relative">
                <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={A.amount}
                  placeholder="0"
                  value={drafts[i] ?? (x.amount > 0 ? String(x.amount) : '')}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setDrafts((d) => ({ ...d, [i]: raw }));
                    const n = Number(raw.replace(/[$,\s]/g, ''));
                    set(i, { amount: Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0 });
                  }}
                  onBlur={() =>
                    setDrafts((d) => {
                      const out = { ...d };
                      delete out[i];
                      return out;
                    })
                  }
                  className="field field-money nums h-9 min-h-0 w-full text-right text-sm"
                />
              </span>
              <button
                type="button"
                className="btn btn-ghost h-9 px-0"
                aria-label={A.remove(label(x.item))}
                onClick={() => remove(i)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {annual.length < MAX_ANNUAL ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((id) => (
            <button key={id} type="button" className="btn btn-sm" onClick={() => add(id)}>
              + {label(id)}
            </button>
          ))}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => add('other.misc')}>
            {A.addOther}
          </button>
        </div>
      ) : (
        <p className="text-muted text-xs">{A.max}</p>
      )}

      {total > 0 ? (
        <p className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-muted">{A.total(fmt.currency0(total))}</span>
          <span className="nums font-medium">
            {A.reserve(fmt.currency0(monthlyReserve(annual)))}
          </span>
        </p>
      ) : null}
    </div>
  );
  if (embedded) return body;

  return (
    <section className="card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <SectionLabel icon="calendar">{A.heading}</SectionLabel>
        <span className="text-muted flex items-center gap-2 text-xs">
          {total > 0
            ? A.summary(fmt.currency0(total), fmt.currency0(monthlyReserve(annual)))
            : A.none}
          <span aria-hidden>{open ? '−' : '+'}</span>
        </span>
      </button>

      {open ? <div className="mt-4">{body}</div> : null}
    </section>
  );
}
