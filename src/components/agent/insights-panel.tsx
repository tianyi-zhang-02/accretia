'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { buildInsights, type Insight } from '@/lib/simulator/insights';
import type { Assumptions } from '@/lib/validation/scenarios';

import PixelIcon, { PixelLabel, type PixelIconName } from '../pixel/pixel-icon';

/** Each finding gets the icon of the thing it's about. */
const ICON_FOR: Record<Insight['id'], PixelIconName> = {
  fireAge: 'house',
  fireNever: 'cloud',
  spendLess: 'coins',
  dropCreep: 'coins',
  investMore: 'chart',
  savingsRateHigh: 'coins',
  returnOptimistic: 'chart',
  cashDrag: 'coins',
  crashCost: 'cloud',
  noRetireAge: 'chair',
  homeExcluded: 'house',
};

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
    <section className="card">
      <PixelLabel icon="gem" className="mb-4">
        {t.insights.heading}
      </PixelLabel>

      {headline ? <Headline insight={headline} /> : null}

      <hr className="rule mt-5 mb-1" />

      {/* Rows, not boxes: one hairline between siblings. */}
      <ul className="rows">
        {rest.map((ins, i) => (
          <li key={`${ins.id}-${i}`} className="row">
            <span className="flex items-start gap-3 text-[13px] leading-relaxed">
              <PixelIcon
                name={ICON_FOR[ins.id]}
                size={14}
                className={`mt-0.5 ${ins.tone === 'warn' ? 'text-negative' : 'text-muted'}`}
              />
              <Message insight={ins} />
            </span>
            {'patch' in ins ? (
              <button
                type="button"
                onClick={() => onChange({ ...assumptions, ...ins.patch })}
                className="btn btn-primary shrink-0"
              >
                {t.insights.apply}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-muted mt-5 flex items-start gap-2 text-[11px] italic">
        <PixelIcon name="shield" size={11} className="mt-px shrink-0" />
        {t.insights.disclaimer}
      </p>
    </section>
  );
}

/**
 * The hero. This sentence is the whole product — the app is literally named
 * after it — so it gets the largest type on the page and a pixel house to
 * anchor it.
 */
function Headline({ insight }: { insight: Insight }) {
  const { t } = useI18n();
  if (insight.id === 'fireAge') {
    return (
      <div className="flex items-start gap-3">
        <PixelIcon name="house" size={34} className="text-foreground mt-1" />
        <div className="min-w-0">
          <p className="figure text-[30px] text-balance sm:text-[38px]">
            {t.insights.fireAge(insight.age)}
          </p>
          <p className="text-muted mt-1 text-[13px]">{t.insights.fireAgeSub(insight.year)}</p>
        </div>
      </div>
    );
  }
  if (insight.id === 'fireNever') {
    return (
      <div className="flex items-start gap-3">
        <PixelIcon name="cloud" size={30} className="text-negative mt-0.5" />
        <p className="text-negative text-sm leading-relaxed">{t.insights.fireNever}</p>
      </div>
    );
  }
  return null;
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
