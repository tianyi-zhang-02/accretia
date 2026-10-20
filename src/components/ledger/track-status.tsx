'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { planAt, type MonthEntry, type YearMonth, type YearReport } from '@/lib/ledger/ledger';
import type { YearRow } from '@/lib/simulator/engine';

import { SectionLabel } from '../ui/icon';
import MetalCard, { Chip } from '../ui/metal-card';
import { monthAllowance } from '@/lib/ledger/allowance';
import type { AnnualExpense } from '@/lib/ledger/annual';

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
  annual,
}: {
  entries: MonthEntry[];
  report: YearReport;
  planRows: YearRow[];
  startingNetWorth: number;
  /** The month on screen — where the plan's mortgage balance is read. */
  at: YearMonth;
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
  const allowance = useMemo(
    () => monthAllowance(entries, at, planRows, startingNetWorth, annual),
    [entries, at, planRows, startingNetWorth, annual],
  );
  // The plan's starting net worth is "now" when it was made: in its first
  // year, measure from the first month logged with a net worth.
  const anchor = useMemo(
    () => entries.find((e) => e.netWorth !== undefined && e.year === planRows[0]?.year),
    [entries, planRows],
  );
  const planNow = latest ? planAt(planRows, startingNetWorth, latest, anchor) : null;
  const planLine = useMemo(
    () => withNw.map((e) => planAt(planRows, startingNetWorth, e, anchor)?.netWorth ?? null),
    [withNw, planRows, startingNetWorth, anchor],
  );
  const monthShort = (e: MonthEntry) =>
    new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      year: 'numeric',
    }).format(new Date(e.year, e.month - 1, 1));

  // A plan that spends more than it brings in falls every year. Being
  // "ahead" of it can still mean going backwards, so that is never painted
  // green — and the metal card says why. (Same test as Plan's
  // "spending more than you bring home": the plan's first year.)
  const planDraining = (planRows[0]?.saved ?? 0) < 0;

  /** Saving / net worth: more than plan is good. Spending: less is. */
  const vsPlan = (actual: number, plan: number, kind: 'more' | 'spend' = 'more') => {
    const d = actual - plan;
    // Within $50 either way is simply "on plan" — "$0 ahead" reads oddly.
    if (Math.abs(d) < 50)
      return (
        <span className={planDraining && kind === 'more' ? '' : 'text-positive'}>{S.onPlan}</span>
      );
    const good = kind === 'more' ? d >= 0 : d <= 0;
    // Spending less than plan is good whatever the plan; only "more than a
    // shrinking plan" loses its green.
    if (good && planDraining && kind === 'more') return <span>{S.ahead(fmt.currency0(d))}</span>;
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
  // kept this year, else where the plan says you are today (the widgets
  // above already say the work-optional age).
  const hero = latest
    ? {
        label: S.netWorthAsOf(monthShort(latest)),
        figure: fmt.currency0(latest.netWorth!),
        sub: planNow ? (
          <>
            {vsPlan(latest.netWorth!, planNow.netWorth)}{' '}
            <span className="text-muted">{S.planSaid(fmt.currency0(planNow.netWorth))}</span>
            {planDraining ? (
              <span className="text-negative mt-1 block text-[12px] leading-snug">
                {S.planDraining}
              </span>
            ) : null}
          </>
        ) : null,
      }
    : report.monthsRecorded > 0 || entries.length > 0
      ? {
          label: S.savedThisYear(report.year),
          figure: fmt.currency0(report.saved),
          sub: <span className="text-muted">{S.addNetWorth}</span>,
        }
      : {
          label: S.heroStartLabel,
          figure: fmt.currency0(startingNetWorth),
          sub: <span className="text-muted">{S.heroStartSub}</span>,
        };

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
              {allowance ? (
                <li className="row">
                  <span className="min-w-0">
                    <span className="block text-[13px]">{t.track.widgets.allowance}</span>
                    <span className="text-muted block text-[11px] leading-snug">
                      {S.allowanceMath(
                        fmt.currency0(allowance.plan),
                        fmt.currency0(allowance.fixed),
                        allowance.annualReserve > 0 ? fmt.currency0(allowance.annualReserve) : null,
                      )}
                    </span>
                  </span>
                  <span
                    className={`nums shrink-0 text-[13px] font-medium ${allowance.flexible < 0 ? 'text-negative' : ''}`}
                  >
                    {fmt.currency0(allowance.flexible)}
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
      </div>
    </section>
  );
}
