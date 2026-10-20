'use client';

import { useEffect, useMemo, useRef } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { monthAllowance } from '@/lib/ledger/allowance';
import type { AnnualExpense } from '@/lib/ledger/annual';
import type { SavingsGoal } from '@/lib/ledger/goals';
import {
  checkInTarget,
  hasFlows,
  monthWaiting,
  planAt,
  streak,
  type MonthEntry,
  type YearMonth,
} from '@/lib/ledger/ledger';
import type { YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

import Icon from '../ui/icon';

/**
 * The glanceable top of Track — what a phone widget would show, inside the
 * app (PWAs can't put widgets on a home screen). Five tiles, each one tap
 * from where you'd act on it: this month (a ring of what you kept against
 * the plan, or a nudge to log it), the logging streak, what's left for
 * everyday spending, the savings-goal jar, and the year work becomes
 * optional. Numbers count up and shapes fill on arrival — all of it off
 * under "reduce motion".
 */

/** Module-level so CountUp's effect doesn't restart on every render. */
const percent = (n: number) => `${Math.round(n)}%`;

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that counts up once when it appears (writes the DOM directly — no re-renders). */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, format]);
  return <span ref={ref}>{format(value)}</span>;
}

function Tile({
  className = '',
  onClick,
  label,
  icon,
  children,
  ariaLabel,
}: {
  className?: string;
  onClick?: () => void;
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const body = (
    <>
      <span className="widget-label">
        <Icon name={icon} size={13} />
        {label}
      </span>
      {children}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`widget ${className}`}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {body}
    </button>
  ) : (
    <div className={`widget ${className}`}>{body}</div>
  );
}

export default function WidgetBoard({
  entries,
  today,
  planRows,
  startingNetWorth,
  majorExpenses,
  startYear,
  annual,
  goals,
  fire,
  monthLabel,
  onLog,
  onGoals,
  onPlan,
}: {
  entries: MonthEntry[];
  today: YearMonth;
  planRows: YearRow[];
  startingNetWorth: number;
  /** The plan's major expenses — monthly comparisons use the everyday plan. */
  majorExpenses?: Assumptions['majorExpenses'];
  /** The plan's first year — where the sun starts rising. */
  startYear: number;
  annual: AnnualExpense[];
  goals: SavingsGoal[];
  fire: { age: number; year: number } | null;
  monthLabel: (ym: YearMonth) => string;
  onLog: () => void;
  onGoals: () => void;
  onPlan: () => void;
}) {
  const { t, fmt } = useI18n();
  const W = t.track.widgets;

  const target = checkInTarget(entries, today);
  // Nudge only for a FINISHED month that isn't logged — never for the month
  // in progress (its numbers aren't final; pulsing all October nags).
  const waiting = monthWaiting(entries, today);
  // The ring shows the latest month with money in it (a net-worth-only month
  // would read "$0 · 0% of plan"), counting pre-tax savings like the plan does.
  const latest = [...entries].reverse().find(hasFlows);
  const kept = latest ? latest.income - latest.spending + (latest.pretaxSavings ?? 0) : 0;
  const planned = latest
    ? (planAt(planRows, startingNetWorth, latest, undefined, majorExpenses)?.monthlySaved ?? null)
    : null;
  const ringPct =
    planned && planned > 0 ? Math.max(0, Math.min(1, kept / planned)) : kept > 0 ? 1 : 0;
  const runs = streak(entries, today);
  const allowance = useMemo(
    () => monthAllowance(entries, today, planRows, startingNetWorth, annual, majorExpenses),
    [entries, today, planRows, startingNetWorth, annual, majorExpenses],
  );
  const jarTarget = goals.reduce((t, g) => t + g.target, 0);
  const jarSaved = goals.reduce((t, g) => t + Math.min(g.saved, g.target), 0);
  const jarPct = jarTarget > 0 ? jarSaved / jarTarget : 0;
  const yearsToGo = fire ? fire.year - today.year : null;
  const sunPct = fire
    ? Math.max(0, Math.min(1, (today.year - startYear) / Math.max(1, fire.year - startYear)))
    : 0;

  const C = 2 * Math.PI * 34;

  return (
    <section className="widget-board" aria-label={W.aria}>
      {/* This month — the ring, or the nudge to log. */}
      <Tile
        className="widget-wide"
        label={
          latest
            ? W.thisMonth(
                latest.year === today.year
                  ? monthLabel(latest)
                  : `${monthLabel(latest)} ${latest.year}`,
              )
            : W.start
        }
        icon="coins"
        onClick={onLog}
      >
        {latest ? (
          <span className="flex flex-1 items-center gap-4">
            <svg viewBox="0 0 80 80" className="widget-ring" aria-hidden>
              <circle cx="40" cy="40" r="34" className="widget-ring-track" />
              <circle
                cx="40"
                cy="40"
                r="34"
                className="widget-ring-fill"
                style={
                  {
                    strokeDasharray: C,
                    strokeDashoffset: C * (1 - ringPct),
                    '--ring-from': C,
                  } as React.CSSProperties
                }
              />
            </svg>
            <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
              <span className={`widget-figure ${kept < 0 ? 'text-negative' : ''}`}>
                <CountUp value={kept} format={fmt.currency0} />
              </span>
              {planned && planned > 0 && kept >= 0 ? (
                <span className="text-muted text-[12px]">
                  {W.ofPlan(
                    kept / planned > 9.99 ? '999%+' : fmt.pct0(Math.round((kept / planned) * 100)),
                  )}
                </span>
              ) : kept < 0 ? (
                <span className="text-negative text-[12px]">{W.overspent}</span>
              ) : null}
              {waiting ? (
                <span className="widget-cta mt-1.5">{W.logCta(monthLabel(waiting))}</span>
              ) : null}
            </span>
          </span>
        ) : (
          <span className="flex flex-1 flex-col items-start justify-end gap-2 text-left">
            <span className="text-[15px] font-medium">{W.firstLog}</span>
            <span className="widget-cta">{W.logCta(monthLabel(target))}</span>
          </span>
        )}
      </Tile>

      {/* Streak — a small flame that never quite sits still. */}
      <Tile label={W.streak} icon="spark">
        <span className="flex flex-1 items-end justify-between">
          <span className="flex flex-col items-start">
            <span className="widget-figure">{runs > 0 ? runs : '—'}</span>
            <span className="text-muted text-[12px]">
              {runs > 0 ? W.months(runs) : W.streakStart}
            </span>
          </span>
          <svg
            viewBox="0 0 24 32"
            className={`widget-flame ${runs > 0 ? '' : 'opacity-30'}`}
            aria-hidden
          >
            <path d="M12 2c1 5 7 8 7 16a7 7 0 0 1-14 0c0-4 2-6 3-8 .5 2 1.5 3 3 3-1-4 0-8 1-11Z" />
            <path
              className="widget-flame-core"
              d="M12 16c.6 2.4 3.5 3.6 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1-3 1.5-4 .3 1 .8 1.4 1.5 1.4-.4-1.6 0-3.2.5-4.4Z"
            />
          </svg>
        </span>
      </Tile>

      {/* What's left for everyday spending. */}
      <Tile label={W.allowance} icon="flag">
        {allowance ? (
          <span className="flex flex-1 flex-col items-start justify-end gap-1.5">
            <span className={`widget-figure ${allowance.flexible < 0 ? 'text-negative' : ''}`}>
              <CountUp value={allowance.flexible} format={fmt.currency0} />
            </span>
            <span className="widget-bar" aria-hidden>
              <span
                style={{
                  width: `${Math.max(6, Math.min(100, allowance.usualFlexible !== null && allowance.flexible > 0 ? (allowance.usualFlexible / allowance.flexible) * 100 : 100))}%`,
                }}
                className={
                  allowance.usualFlexible !== null && allowance.usualFlexible > allowance.flexible
                    ? 'bg-negative'
                    : 'bg-positive'
                }
              />
            </span>
            <span className="text-muted text-[12px]">
              {allowance.usualFlexible !== null
                ? W.usually(fmt.currency0(allowance.usualFlexible))
                : W.perMonth}
            </span>
          </span>
        ) : (
          <span className="text-muted flex flex-1 items-end text-[13px]">{W.noPlan}</span>
        )}
      </Tile>

      {/* The savings jar fills toward the goals. */}
      <Tile label={W.jar} icon="gem" onClick={onGoals}>
        <span className="flex flex-1 items-end justify-between gap-2">
          <span className="flex flex-col items-start">
            {jarTarget > 0 ? (
              <>
                <span className="widget-figure">
                  <CountUp value={jarPct * 100} format={percent} />
                </span>
                <span className="text-muted text-[12px]">{W.ofGoals}</span>
              </>
            ) : (
              <span className="text-[13px] font-medium">{W.setGoal}</span>
            )}
          </span>
          <svg viewBox="0 0 40 52" className="widget-jar" aria-hidden>
            <defs>
              <clipPath id="jar-inside">
                <path d="M9 12h22v4c4 2 5 6 5 10v18a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V26c0-4 1-8 5-10Z" />
              </clipPath>
            </defs>
            <g clipPath="url(#jar-inside)">
              <g
                className="widget-jar-level"
                style={{ '--level': `${(1 - jarPct) * 40 + 12}px` } as React.CSSProperties}
              >
                <path
                  className="widget-jar-wave"
                  d="M-40 4 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 V60 H-40 Z"
                />
              </g>
            </g>
            <path
              className="widget-jar-glass"
              d="M9 12h22v4c4 2 5 6 5 10v18a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V26c0-4 1-8 5-10Z"
            />
            <rect x="7" y="6" width="26" height="6" rx="2" className="widget-jar-lid" />
          </svg>
        </span>
      </Tile>

      {/* The year work becomes optional — a sun on its way up. */}
      <Tile label={W.fire} icon="clock" onClick={onPlan}>
        <span className="flex flex-1 items-end justify-between gap-2">
          <span className="flex flex-col items-start">
            {fire ? (
              <>
                <span className="widget-figure">{W.age(fire.age)}</span>
                <span className="text-muted text-[12px]">
                  {yearsToGo !== null && yearsToGo > 0 ? W.yearsToGo(yearsToGo) : W.there}
                </span>
              </>
            ) : (
              <span className="text-[13px] font-medium">{W.adjustPlan}</span>
            )}
          </span>
          <svg viewBox="0 0 48 28" className="widget-sun" aria-hidden>
            <path d="M4 26a20 20 0 0 1 40 0" className="widget-sun-arc" />
            <line x1="1" y1="26.5" x2="47" y2="26.5" className="widget-sun-horizon" />
            <g
              className="widget-sun-orbit"
              style={{ '--sun-turn': `${sunPct * 180}deg` } as React.CSSProperties}
            >
              <circle cx="4" cy="26" r="3.6" className="widget-sun-dot" />
            </g>
          </svg>
        </span>
      </Tile>
    </section>
  );
}

/** A small burst from the Save button — the month is in. */
export function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.3;
        const dist = 46 + (i % 5) * 12;
        return {
          dx: Math.round(Math.cos(angle) * dist),
          dy: Math.round(Math.sin(angle) * dist - 30),
          r: (i * 47) % 360,
          c: ['var(--accent)', 'var(--foreground)', '#f5c451', '#7cc6ff'][i % 4]!,
          d: (i % 4) * 25,
        };
      }),
    [],
  );
  return (
    <span className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          style={
            {
              '--dx': `${b.dx}px`,
              '--dy': `${b.dy}px`,
              '--rot': `${b.r}deg`,
              background: b.c,
              animationDelay: `${b.d}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
