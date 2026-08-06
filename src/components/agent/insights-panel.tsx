'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { buildInsights, type Insight } from '@/lib/simulator/insights';
import type { Assumptions } from '@/lib/validation/scenarios';

/**
 * Renders what the insight engine found, most valuable first, and lets the
 * user apply a suggested change in one click.
 *
 * The engine ranks by measured impact, so this component stays dumb: it
 * formats and it applies patches. Findings without a patch are reality
 * checks — they render without a button on purpose.
 */
export default function InsightsPanel({
  assumptions,
  onChange,
}: {
  assumptions: Assumptions;
  onChange: (next: Assumptions) => void;
}) {
  const insights = useMemo(() => buildInsights(assumptions), [assumptions]);
  const { t } = useI18n();

  if (insights.length === 0) return null;
  const [headline, ...rest] = insights;

  return (
    <section className="border-border bg-surface rounded-lg border p-5">
      <p className="text-muted mb-3 text-[10px] tracking-[0.18em] uppercase">{t.insights.heading}</p>

      {headline ? <Headline insight={headline} /> : null}

      <ul className="mt-3 flex flex-col gap-1.5">
        {rest.map((ins, i) => (
          <li
            key={`${ins.id}-${i}`}
            className="border-border flex items-start justify-between gap-3 rounded border px-3 py-2"
          >
            <span className="text-xs">
              <Dot tone={ins.tone} />
              <Message insight={ins} />
            </span>
            {'patch' in ins ? (
              <button
                type="button"
                onClick={() => onChange({ ...assumptions, ...ins.patch })}
                className="border-border hover:bg-foreground/5 shrink-0 rounded border px-2 py-1 text-[11px]"
              >
                {t.insights.apply}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-muted mt-3 text-[10px] italic">{t.insights.disclaimer}</p>
    </section>
  );
}

function Headline({ insight }: { insight: Insight }) {
  const { t } = useI18n();
  if (insight.id === 'fireAge') {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="serif-display text-2xl">{t.insights.fireAge(insight.age)}</p>
        <p className="text-muted text-xs">{t.insights.fireAgeSub(insight.year)}</p>
      </div>
    );
  }
  if (insight.id === 'fireNever') {
    return <p className="text-negative text-sm">{t.insights.fireNever}</p>;
  }
  return null;
}

function Dot({ tone }: { tone: Insight['tone'] }) {
  const color =
    tone === 'good' ? 'bg-positive' : tone === 'warn' ? 'bg-negative' : 'bg-foreground/30';
  return <span className={`mr-2 inline-block size-1.5 rounded-full align-middle ${color}`} />;
}

function Message({ insight }: { insight: Insight }) {
  const { t, fmt } = useI18n();
  const m = t.insights;
  switch (insight.id) {
    case 'spendLess':
      return insight.fromNever
        ? m.spendLessReach(insight.newAge)
        : m.spendLess(insight.years, insight.newAge);
    case 'dropCreep':
      return insight.fromNever
        ? m.dropCreepReach(insight.newAge)
        : m.dropCreep(insight.years, insight.newAge);
    case 'investMore':
      return insight.fromNever
        ? m.investMoreReach(insight.newAge)
        : m.investMore(insight.years, insight.newAge);
    case 'savingsRateHigh':
      return m.savingsRateHigh(insight.ratePct);
    case 'returnOptimistic':
      return m.returnOptimistic(fmt.pct(insight.returnPct));
    case 'cashDrag':
      return m.cashDrag(insight.sharePct);
    case 'crashCost':
      return m.crashCost(insight.crashYear, insight.years);
    case 'noRetireAge':
      return m.noRetireAge;
    case 'homeExcluded':
      return m.homeExcluded;
    default:
      return null;
  }
}
