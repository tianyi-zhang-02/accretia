'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { solveGoalSeek, type GoalSeekResult, type SolveResult } from '@/lib/simulator/goalSeek';
import type { Assumptions, SimTarget } from '@/lib/validation/scenarios';
import { PixelLabel } from '../pixel/pixel-icon';

/**
 * Goal-seek display panel. Spec contract:
 *
 *   - When target is absent: surface a small "set a target to enable" hint.
 *   - When already on track: celebrate the surplus, don't compute levers.
 *   - When short: compute all 4 levers and display them side by side.
 *
 * Computation runs on demand (button) rather than every keystroke.
 *
 * Copy convention: conditional ("saving $X/mo more would reach the target"),
 * honest about "not reachable" cases.
 */
function NumField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : value === 0 ? '' : String(value);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-[13px]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={display}
          placeholder="0"
          step={step}
          min={min}
          max={max}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const tval = e.target.value;
            setDraft(tval);
            if (tval.trim() === '') return;
            const n = Number(tval);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => {
            if (draft !== null) {
              const trimmed = draft.trim();
              if (trimmed === '' || !Number.isFinite(Number(trimmed))) {
                onChange(0);
              }
              setDraft(null);
            }
          }}
          className="border-border focus:border-foreground nums w-full rounded border bg-transparent px-3 py-2 text-base outline-none"
        />
        {suffix ? <span className="text-muted text-[13px]">{suffix}</span> : null}
      </div>
    </label>
  );
}

function LeverRow({
  label,
  result,
  formatValue,
  formatDelta,
}: {
  label: string;
  result: SolveResult;
  formatValue: (v: number) => string;
  formatDelta: (d: number) => string;
}) {
  return (
    <li className="border-border flex items-start justify-between gap-3 rounded border px-3 py-2">
      <span className="text-foreground text-[13px]">{label}</span>
      {result.ok ? (
        <span className="text-muted nums text-right text-[13px]">
          <span className="text-foreground">{formatValue(result.value)}</span>{' '}
          <span className="text-muted">({formatDelta(result.delta)})</span>
        </span>
      ) : (
        <span className="text-muted text-right text-xs italic">{result.reason}</span>
      )}
    </li>
  );
}

export default function GoalSeekPanel({
  assumptions,
  onChange,
}: {
  assumptions: Assumptions;
  onChange: (next: Assumptions) => void;
}) {
  const { t } = useI18n();
  const [result, setResult] = useState<GoalSeekResult | null>(null);
  const hasTarget = !!assumptions.target;
  const hasPeople = assumptions.people.length > 0;

  function setTarget(next: SimTarget | undefined) {
    onChange({ ...assumptions, target: next });
  }

  function recompute() {
    setResult(solveGoalSeek(assumptions));
  }

  return (
    <section className="border-border rounded border p-4">
      <div className="flex items-center justify-between gap-2">
        <PixelLabel icon="flag">{t.goalSeek.heading}</PixelLabel>
        <button
          type="button"
          onClick={() => {
            if (hasTarget) {
              setTarget(undefined);
              setResult(null);
            } else {
              setTarget({ amount: 5_000_000, age: 50 });
              setResult(null);
            }
          }}
          className="text-muted hover:text-foreground text-xs"
        >
          {hasTarget ? t.goalSeek.clearTarget : t.goalSeek.setTarget}
        </button>
      </div>

      {!hasTarget ? (
        <p className="text-muted mt-2 text-[13px]">{t.goalSeek.hintNoTarget}</p>
      ) : !hasPeople ? (
        <p className="text-muted mt-2 text-[13px] italic">{t.goalSeek.hintNoPeople}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <NumField
              label={t.goalSeek.targetAmount}
              value={assumptions.target!.amount}
              step={50_000}
              min={0}
              suffix="$"
              onChange={(n) => setTarget({ amount: Math.max(0, n), age: assumptions.target!.age })}
            />
            <NumField
              label={t.goalSeek.byAge}
              value={assumptions.target!.age}
              step={1}
              min={0}
              max={120}
              onChange={(n) =>
                setTarget({
                  amount: assumptions.target!.amount,
                  age: Math.max(0, Math.min(120, n)),
                })
              }
            />
          </div>
          <button
            type="button"
            onClick={recompute}
            className="bg-foreground text-background mt-3 rounded px-3 py-1.5 text-[13px] font-medium"
          >
            {t.goalSeek.compute}
          </button>

          {result ? <GoalSeekDisplay result={result} /> : null}

          <p className="text-muted mt-3 text-[11px] italic">{t.goalSeek.disclaimer}</p>
        </>
      )}
    </section>
  );
}

function GoalSeekDisplay({ result }: { result: GoalSeekResult }) {
  const { t, fmt } = useI18n();
  if (result.kind === 'no-target' || result.kind === 'no-people') return null;

  if (result.kind === 'on-track') {
    return (
      <div className="border-border mt-3 flex flex-col gap-1 rounded border p-3">
        <p className="text-positive text-[13px] font-medium">{t.goalSeek.onTrack}</p>
        <p className="text-muted nums text-xs">
          {t.goalSeek.onTrackDetail(
            fmt.currency0(result.projected),
            result.targetAge,
            fmt.currency0(result.surplus),
            fmt.currency0(result.target),
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="border-border mt-3 flex flex-col gap-2 rounded border p-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-foreground text-[13px]">
          {t.goalSeek.projectedBy(fmt.currency0(result.projected), result.targetAge)}
        </p>
        <p className="text-negative text-[13px]">
          {t.goalSeek.shortBy(fmt.currency0(result.gap), fmt.currency0(result.target))}
        </p>
      </div>
      <p className="text-muted mt-1 text-xs">{t.goalSeek.anyOne}</p>
      <ul className="flex flex-col gap-1.5">
        <LeverRow
          label={t.goalSeek.leverSaveExtra}
          result={
            result.levers.extraMonthlyContribution.ok
              ? {
                  ok: true,
                  // Convert annual → monthly for display, both value & delta.
                  value: result.levers.extraMonthlyContribution.value / 12,
                  delta: result.levers.extraMonthlyContribution.delta / 12,
                }
              : result.levers.extraMonthlyContribution
          }
          formatValue={(v) => t.goalSeek.perMonth(fmt.currency0(v))}
          formatDelta={(d) => t.goalSeek.perMonthVsNow(fmt.currencyDelta(d))}
        />
        <LeverRow
          label={t.goalSeek.leverReturn}
          result={result.levers.returnPct}
          formatValue={(v) => fmt.pct(v)}
          formatDelta={(d) => t.goalSeek.pointsDelta(d)}
        />
        <LeverRow
          label={t.goalSeek.leverSpendLess}
          result={
            result.levers.annualExpenses.ok
              ? {
                  ok: true,
                  value: result.levers.annualExpenses.value / 12,
                  delta: result.levers.annualExpenses.delta / 12,
                }
              : result.levers.annualExpenses
          }
          formatValue={(v) => t.goalSeek.perMonth(fmt.currency0(v))}
          formatDelta={(d) => t.goalSeek.perMonthVsNow(fmt.currencyDelta(d))}
        />
        <LeverRow
          label={t.goalSeek.leverPushAge}
          result={result.levers.targetAge}
          formatValue={(v) => t.goalSeek.ageValue(v)}
          formatDelta={(d) => t.goalSeek.yearsDelta(d)}
        />
        <LeverRow
          label={t.goalSeek.leverWindfall}
          result={result.levers.oneTimeWindfall}
          formatValue={(v) => fmt.currency0(v)}
          formatDelta={() => t.goalSeek.windfallNote}
        />
      </ul>
    </div>
  );
}
