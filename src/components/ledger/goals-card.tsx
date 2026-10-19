'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import {
  GOAL_KINDS,
  MAX_GOALS,
  goalStatus,
  goalsSummary,
  suggestEmergency,
  type GoalKind,
  type SavingsGoal,
} from '@/lib/ledger/goals';
import { shiftMonth, type MonthEntry, type YearMonth } from '@/lib/ledger/ledger';

import { SectionLabel } from '../ui/icon';

const money = (raw: string): number => {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e12) : 0;
};

/** A money field that keeps what's being typed until it's left. */
function MoneyInput({
  value,
  onChange,
  label,
  className = '',
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className={`relative ${className}`}>
      <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder="0"
        value={draft ?? (value > 0 ? String(value) : '')}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(money(e.target.value));
        }}
        onBlur={() => setDraft(null)}
        className="field field-money nums h-9 min-h-0 w-full text-right text-sm"
      />
    </span>
  );
}

/**
 * Savings goals: progress, what each needs a month, and whether together
 * they fit in what's been kept lately. Open whenever there are goals —
 * the progress IS the point; the details sit behind "Edit".
 */
export default function GoalsCard({
  goals,
  entries,
  today,
  onChange,
  embedded = false,
  notify,
}: {
  goals: SavingsGoal[];
  entries: MonthEntry[];
  today: YearMonth;
  onChange: (next: SavingsGoal[]) => void;
  /** Inside the Budgets & goals card: no card chrome or heading. */
  embedded?: boolean;
  /** Undoable removals: a toast with Undo, as for clearing a month. */
  notify?: (text: string, undo?: () => void) => void;
}) {
  const { t, fmt, locale } = useI18n();
  const G = t.track.goals;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const summary = useMemo(() => goalsSummary(goals, entries, today), [goals, entries, today]);
  const emergency = useMemo(() => suggestEmergency(entries, today), [entries, today]);
  const monthYear = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      year: 'numeric',
    });
    return (g: YearMonth) => f.format(new Date(g.year, g.month - 1, 1));
  }, [locale]);
  const monthName = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' });
    return (m: number) => f.format(new Date(2000, m - 1, 1));
  }, [locale]);

  const set = (i: number, patch: Partial<SavingsGoal>) =>
    onChange(goals.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  function add(kind: GoalKind) {
    if (goals.length >= MAX_GOALS) return;
    const by = shiftMonth(today, kind === 'emergency' ? 11 : 23);
    const target = kind === 'emergency' && emergency ? emergency : 0;
    onChange([...goals, { kind, target, saved: 0, year: by.year, month: by.month }]);
    setAdding(false);
    setEditing(true);
  }

  const Wrapper = embedded ? 'div' : 'section';
  return (
    <Wrapper className={embedded ? '' : 'card'}>
      <div className={`flex items-center gap-3 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {embedded ? null : <SectionLabel icon="gem">{G.heading}</SectionLabel>}
        {goals.length ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? G.doneEditing : G.edit}
          </button>
        ) : null}
      </div>

      {goals.length === 0 ? <p className="text-muted mt-2 text-xs">{G.hint}</p> : null}

      {goals.length ? (
        <ul className="mt-3 flex flex-col gap-4">
          {goals.map((g, i) => {
            const s = goalStatus(g, today);
            return (
              <li key={i} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-medium">{G.kinds[g.kind]}</span>
                  <span className="nums text-muted text-xs">{G.by(monthYear(g))}</span>
                </div>
                <div className="grid grid-cols-[1fr_8rem] items-center gap-3">
                  <span
                    className="bg-surface-2 h-2 overflow-hidden rounded-full"
                    role="progressbar"
                    aria-valuenow={Math.round(s.pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={G.kinds[g.kind]}
                  >
                    <span
                      className={`block h-full rounded-full ${s.overdue ? 'bg-negative' : 'bg-positive'}`}
                      style={{ width: `${Math.max(s.pct > 0 ? 2 : 0, s.pct)}%` }}
                    />
                  </span>
                  <MoneyInput
                    label={G.saved(G.kinds[g.kind])}
                    value={g.saved}
                    onChange={(saved) => set(i, { saved })}
                  />
                </div>
                <p
                  className={`text-[11px] leading-snug ${s.overdue ? 'text-negative' : s.done ? 'text-positive' : 'text-muted'}`}
                >
                  {g.target <= 0
                    ? G.noTarget
                    : s.done
                      ? G.done(fmt.currency0(Math.max(g.saved, g.target)))
                      : s.overdue
                        ? G.overdue(fmt.currency0(s.left))
                        : G.status(
                            fmt.pct0(s.pct),
                            fmt.currency0(g.target),
                            fmt.currency0(s.left),
                            s.monthsLeft,
                            fmt.currency0(s.perMonth),
                          )}
                </p>

                {editing ? (
                  <div className="bg-surface-2 grid grid-cols-2 gap-2 rounded-[10px] p-2.5 sm:grid-cols-[1fr_8rem_5rem_5.5rem_2.25rem]">
                    <select
                      aria-label={G.kind}
                      value={g.kind}
                      onChange={(e) => set(i, { kind: e.target.value as GoalKind })}
                      className="field h-9 min-h-0 text-sm"
                    >
                      {GOAL_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {G.kinds[k]}
                        </option>
                      ))}
                    </select>
                    <MoneyInput
                      label={G.target}
                      value={g.target}
                      onChange={(target) => set(i, { target })}
                    />
                    <select
                      aria-label={G.byMonth}
                      value={g.month}
                      onChange={(e) => set(i, { month: Number(e.target.value) })}
                      className="field h-9 min-h-0 text-sm"
                    >
                      {Array.from({ length: 12 }, (_, m) => (
                        <option key={m} value={m + 1}>
                          {monthName(m + 1)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={G.byYear}
                      value={g.year}
                      onChange={(e) => set(i, { year: Number(e.target.value) })}
                      className="field h-9 min-h-0 text-sm"
                    >
                      {Array.from({ length: 31 }, (_, k) => today.year - 1 + k)
                        .concat(g.year < today.year - 1 || g.year > today.year + 29 ? [g.year] : [])
                        .map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost col-span-2 h-9 sm:col-span-1 sm:px-0"
                      aria-label={G.remove(G.kinds[g.kind])}
                      onClick={() => {
                        const before = goals;
                        onChange(goals.filter((_, j) => j !== i));
                        notify?.(t.toast.removed(G.kinds[g.kind]), () => onChange(before));
                      }}
                    >
                      <span className="sm:hidden">{G.removeShort}</span>
                      <span aria-hidden className="hidden sm:inline">
                        ×
                      </span>
                    </button>
                    {g.kind === 'emergency' && emergency && g.target !== emergency ? (
                      <p className="text-muted col-span-full text-[11px]">
                        {G.emergencyHint(fmt.currency0(emergency))}{' '}
                        <button
                          type="button"
                          className="text-accent underline-offset-2 hover:underline"
                          onClick={() => set(i, { target: emergency })}
                        >
                          {G.use}
                        </button>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {goals.length && summary.needPerMonth > 0 ? (
        <div className="bg-surface-2 mt-4 rounded-[12px] p-3">
          <p className="flex items-baseline justify-between gap-3 text-[13px]">
            <span>{G.needAll}</span>
            <span className="nums font-medium">{fmt.currency0(summary.needPerMonth)}</span>
          </p>
          {summary.keptPerMonth !== null && summary.room !== null ? (
            <p
              className={`mt-1 text-[11px] leading-snug ${summary.room >= 0 ? 'text-positive' : 'text-negative'}`}
            >
              {summary.room >= 0
                ? G.fits(fmt.currency0(summary.keptPerMonth))
                : G.short(fmt.currency0(summary.keptPerMonth), fmt.currency0(-summary.room))}
            </p>
          ) : null}
        </div>
      ) : null}

      {goals.length < MAX_GOALS ? (
        adding || goals.length === 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {GOAL_KINDS.map((k) => (
              <button key={k} type="button" className="btn btn-sm" onClick={() => add(k)}>
                + {G.kinds[k]}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-3"
            onClick={() => setAdding(true)}
          >
            {G.add}
          </button>
        )
      ) : null}
    </Wrapper>
  );
}
