'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import type { Assumptions } from '@/lib/validation/scenarios';

import PixelIcon, { type PixelIconName } from '../pixel/pixel-icon';

/**
 * The plan, as five numbers.
 *
 * The full form is eight sections and ~23 inputs — correct, but it turns the
 * first screen into a spreadsheet. Almost every visit only ever touches the
 * same handful of figures, so those get scannable rows here and everything
 * else moves one tap away.
 *
 * Writing back is deliberately conservative: a household with several people
 * or several career stages has no single "income" field to edit, so those
 * rows go read-only and point at the full form rather than guessing which
 * stage the user meant.
 */

type Field = 'age' | 'income' | 'spending' | 'netWorth' | 'retireAge';

type Line = {
  key: Field;
  icon: PixelIconName;
  label: string;
  value: number;
  /** Rendered as currency when true, a plain count otherwise. */
  money: boolean;
  /** False when the plan is too complex for a single-number edit. */
  editable: boolean;
  hint?: string;
};

const thisYear = () => new Date().getFullYear();

export function summarize(a: Assumptions, t: ReturnType<typeof useI18n>['t']): Line[] {
  const p = a.people[0];
  const soloSimple = a.people.length === 1 && (p?.careerStages.length ?? 0) <= 1;
  const income = a.people.reduce(
    (sum, person) =>
      sum +
      person.careerStages.reduce(
        (best, s) =>
          Math.max(best, s.baseSalary * (1 + (s.bonusPct ?? 0) / 100) + (s.annualEquity ?? 0)),
        0,
      ),
    0,
  );
  const s = t.summary;
  return [
    {
      key: 'age',
      icon: 'person',
      label: s.age,
      value: p ? thisYear() - p.birthYear : 0,
      money: false,
      editable: !!p,
    },
    {
      key: 'income',
      icon: 'coins',
      label: a.people.length > 1 ? s.householdIncome : s.income,
      value: Math.round(income),
      money: true,
      editable: soloSimple,
      hint: soloSimple ? undefined : s.seeDetails,
    },
    {
      key: 'spending',
      icon: 'chart',
      label: s.spending,
      value: a.recurringAnnualExpenses,
      money: true,
      editable: true,
    },
    {
      key: 'netWorth',
      icon: 'gem',
      label: s.netWorth,
      value: a.startingNetWorth,
      money: true,
      editable: true,
    },
    {
      key: 'retireAge',
      icon: 'chair',
      label: s.retireAge,
      value: p?.retireAge ?? 0,
      money: false,
      editable: !!p,
      hint: p?.retireAge === undefined ? s.neverRetires : undefined,
    },
  ];
}

/** Apply one summary edit back onto the assumptions. */
function applyEdit(a: Assumptions, key: Field, v: number): Assumptions {
  const p = a.people[0];
  switch (key) {
    case 'age': {
      if (!p) return a;
      const birthYear = thisYear() - Math.round(v);
      return { ...a, people: a.people.map((x) => ({ ...x, birthYear })) };
    }
    case 'income': {
      if (!p) return a;
      const stages = p.careerStages;
      const next = stages.length
        ? stages.map((s, i) => (i === 0 ? { ...s, baseSalary: Math.max(0, v) } : s))
        : [
            {
              label: p.name,
              startAge: thisYear() - p.birthYear,
              baseSalary: Math.max(0, v),
              annualRaisePct: 3,
            },
          ];
      return { ...a, people: [{ ...p, careerStages: next }, ...a.people.slice(1)] };
    }
    case 'spending':
      return { ...a, recurringAnnualExpenses: Math.max(0, v) };
    case 'netWorth': {
      const nw = Math.max(0, v);
      // startingInvested may not exceed net worth (schema invariant).
      return { ...a, startingNetWorth: nw, startingInvested: Math.min(a.startingInvested, nw) };
    }
    case 'retireAge': {
      const age = Math.round(v);
      return {
        ...a,
        people: a.people.map((x) => ({ ...x, retireAge: age <= 0 ? undefined : age })),
      };
    }
  }
}

export default function PlanSummary({
  assumptions,
  onChange,
  children,
}: {
  assumptions: Assumptions;
  onChange: (next: Assumptions) => void;
  /** The full form — revealed on demand. */
  children: React.ReactNode;
}) {
  const { t, fmt } = useI18n();
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const lines = summarize(assumptions, t);

  function commit(key: Field) {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(applyEdit(assumptions, key, n));
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <span className="eyebrow mb-1">
          <PixelIcon name="clock" size={12} />
          {t.summary.heading}
        </span>

        <ul className="rows">
          {lines.map((l) => (
            <li key={l.key} className="row items-center">
              <span className="flex items-center gap-2.5 text-[13px]">
                <PixelIcon name={l.icon} size={13} className="text-muted" />
                <span>
                  {l.label}
                  {l.hint ? <span className="text-muted block text-[11px]">{l.hint}</span> : null}
                </span>
              </span>

              {editing === l.key ? (
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(l.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(l.key);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="field nums w-40 text-right"
                />
              ) : (
                <button
                  type="button"
                  disabled={!l.editable}
                  onClick={() => {
                    setEditing(l.key);
                    setDraft(String(l.value));
                  }}
                  className={`nums text-[15px] font-medium ${
                    l.editable ? 'hover:text-accent' : 'text-muted cursor-default'
                  }`}
                >
                  {l.money ? fmt.currency0(l.value) : l.value > 0 ? l.value : '—'}
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="btn btn-ghost mt-4 w-full"
        >
          {showAll ? t.summary.hideAll : t.summary.showAll}
        </button>
      </section>

      {showAll ? children : null}
    </div>
  );
}
