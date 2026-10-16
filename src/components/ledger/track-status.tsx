'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { planAt, type MonthEntry, type YearMonth, type YearReport } from '@/lib/ledger/ledger';
import type { YearRow } from '@/lib/simulator/engine';

import { SectionLabel } from '../ui/icon';
import MetalCard, { Chip } from '../ui/metal-card';
import LedgerFindings from './ledger-findings';
import type { AnnualExpense } from '@/lib/ledger/annual';
import type { Budgets } from '@/lib/ledger/budgets';

/**
 * "Am I on track?" — what was logged, set against what the plan expected
 * for the same months. The projection is a yardstick here, not the point.
 */

const W = 320;
const H = 64;

/** Actual vs plan net worth over the logged months; plain SVG, no library. */
function Sparkline({ actual, plan }: { actual: number[]; plan: Array<number | null> }) {
  const all = [...actual, ...plan.filter((v): v is number => v !== null)];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => (actual.length === 1 ? W / 2 : (i / (actual.length - 1)) * W);
  const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 8);
  const line = (vals: Array<number | null>) =>
    vals
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 h-16 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={line(plan)}
        fill="none"
        className="text-muted"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={line(actual)}
        fill="none"
        className="text-accent"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function TrackStatus({
  entries,
  report,
  planRows,
  startingNetWorth,
  at,
  fire,
  onOpenPlan,
  budgets,
  annual,
}: {
  entries: MonthEntry[];
  report: YearReport;
  planRows: YearRow[];
  startingNetWorth: number;
  /** The month on screen — where the plan's mortgage balance is read. */
  at: YearMonth;
  fire: { age: number; year: number } | null;
  onOpenPlan: () => void;
  budgets: Budgets;
  annual: AnnualExpense[];
}) {
  const { t, fmt, locale } = useI18n();
  const S = t.track.status;

  const withNw = useMemo(
    () => entries.filter((e) => e.netWorth !== undefined).slice(-24),
    [entries],
  );
  const latest = withNw.at(-1);
  const loanLeft = planAt(planRows, startingNetWorth, at)?.mortgageBalance ?? 0;
  const planNow = latest ? planAt(planRows, startingNetWorth, latest) : null;
  const planLine = useMemo(
    () => withNw.map((e) => planAt(planRows, startingNetWorth, e)?.netWorth ?? null),
    [withNw, planRows, startingNetWorth],
  );
  const monthShort = (e: MonthEntry) =>
    new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      year: 'numeric',
    }).format(new Date(e.year, e.month - 1, 1));

  /** Saving / net worth: more than plan is good. Spending: less is. */
  const vsPlan = (actual: number, plan: number, kind: 'more' | 'spend' = 'more') => {
    const d = actual - plan;
    const good = kind === 'more' ? d >= 0 : d <= 0;
    const text =
      kind === 'more'
        ? d >= 0
          ? S.ahead(fmt.currency0(d))
          : S.behind(fmt.currency0(-d))
        : d > 0
          ? S.over(fmt.currency0(d))
          : S.under(fmt.currency0(-d));
    return <span className={good ? 'text-positive' : 'text-negative'}>{text}</span>;
  };

  // The hero, on the metal card: net worth if it's logged, else what was
  // kept this year, else the plan's one sentence.
  const hero = latest
    ? {
        label: S.netWorthAsOf(monthShort(latest)),
        figure: fmt.currency0(latest.netWorth!),
        sub: planNow ? (
          <>
            {vsPlan(latest.netWorth!, planNow.netWorth)}{' '}
            <span className="text-muted">{S.planSaid(fmt.currency0(planNow.netWorth))}</span>
          </>
        ) : null,
      }
    : report.monthsRecorded > 0
      ? {
          label: S.savedThisYear(report.year),
          figure: fmt.currency0(report.saved),
          sub: <span className="text-muted">{S.addNetWorth}</span>,
        }
      : fire
        ? {
            label: S.heroFireLabel,
            figure: S.heroFireAge(fire.age),
            sub: <span className="text-muted">{S.heroFireSub(fire.year)}</span>,
          }
        : { label: S.heading, figure: '—', sub: <span className="text-muted">{S.fireNever}</span> };

  return (
    <section className="flex flex-col gap-4">
      <MetalCard className="flex min-h-[200px] flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-3">
          <span className="metal-muted text-[13px]">{hero.label}</span>
          <Chip />
        </div>
        <div>
          <p className="metal-figure text-[38px] sm:text-[42px]">{hero.figure}</p>
          {hero.sub ? <p className="mt-1.5 text-[13px]">{hero.sub}</p> : null}
        </div>
        <div className="flex items-end justify-between gap-3">
          <span className="metal-muted nums text-[11px]">
            {latest
              ? `${String(latest.month).padStart(2, '0')}/${String(latest.year).slice(2)}`
              : ''}
          </span>
          <span className="metal-mark">Work Optional</span>
        </div>
      </MetalCard>

      <div className="card">
        <SectionLabel icon="flag">{S.heading}</SectionLabel>

        {entries.length === 0 ? (
          <ol className="text-muted mt-3 flex flex-col gap-2 text-[13px]">
            {S.how.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-accent nums font-medium">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        ) : (
          <>
            {withNw.length >= 2 ? (
              <>
                <Sparkline actual={withNw.map((e) => e.netWorth!)} plan={planLine} />
                <p className="text-muted mt-1 flex gap-4 text-[11px]">
                  <span>
                    <span className="text-accent">━</span> {S.legendActual}
                  </span>
                  <span>┄ {S.legendPlan}</span>
                </p>
              </>
            ) : null}

            <ul className="rows mt-4">
              {report.monthsRecorded > 0 ? (
                <li className="row items-center">
                  <span className="text-[13px]">{S.savedYtd(report.year)}</span>
                  <span className="nums text-right text-[13px]">
                    <span className="font-medium">{fmt.currency0(report.saved)}</span>
                    {report.plan ? (
                      <span className="text-xs"> · {vsPlan(report.saved, report.plan.saved)}</span>
                    ) : null}
                  </span>
                </li>
              ) : null}
              {report.monthsRecorded > 0 ? (
                <li className="row items-center">
                  <span className="text-[13px]">{S.spentYtd(report.year)}</span>
                  <span className="nums text-right text-[13px]">
                    <span className="font-medium">{fmt.currency0(report.spending)}</span>
                    {report.plan ? (
                      <span className="text-xs">
                        {' '}
                        · {vsPlan(report.spending, report.plan.spending, 'spend')}
                      </span>
                    ) : null}
                  </span>
                </li>
              ) : null}
              {report.savingsRatePct !== null ? (
                <li className="row items-center">
                  <span className="text-[13px]">{S.savingsRate}</span>
                  <span className="nums text-[13px] font-medium">
                    {fmt.pct0(report.savingsRatePct)}
                  </span>
                </li>
              ) : null}
            </ul>
          </>
        )}

        {loanLeft > 0 ? (
          <p className="mt-3 flex items-center justify-between text-[13px]">
            <span>{S.mortgage}</span>
            <span className="nums font-medium">{fmt.currency0(loanLeft)}</span>
          </p>
        ) : null}

        {/* The projection, reduced to its one sentence — the rest lives in Plan. */}
        <hr className="rule my-4" />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px]">{fire ? S.fire(fire.age, fire.year) : S.fireNever}</p>
          <button type="button" className="btn btn-ghost shrink-0" onClick={onOpenPlan}>
            {S.openPlan} ›
          </button>
        </div>
      </div>
      <LedgerFindings entries={entries} planRows={planRows} budgets={budgets} annual={annual} />
    </section>
  );
}
