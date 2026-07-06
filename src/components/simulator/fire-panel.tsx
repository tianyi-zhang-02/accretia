'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import type { YearRow } from '@/lib/simulator/engine';
import { computeFire, type FireMilestone } from '@/lib/simulator/fire';
import type { Assumptions, FireConfig } from '@/lib/validation/scenarios';

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
      <span className="text-muted text-xs">{label}</span>
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
            const t = e.target.value;
            setDraft(t);
            if (t.trim() === '') return;
            const n = Number(t);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => {
            if (draft !== null) {
              const trimmed = draft.trim();
              if (trimmed === '' || !Number.isFinite(Number(trimmed))) onChange(0);
              setDraft(null);
            }
          }}
          className="border-border focus:border-foreground nums w-full rounded border bg-transparent px-3 py-2 text-base outline-none"
        />
        {suffix ? <span className="text-muted text-xs">{suffix}</span> : null}
      </div>
    </label>
  );
}

export default function FirePanel({
  assumptions,
  rows,
  onChange,
}: {
  assumptions: Assumptions;
  rows: YearRow[];
  onChange: (next: Assumptions) => void;
}) {
  const { t, fmt } = useI18n();

  // Effective config (fall back to sensible defaults when `fire` is absent).
  const swrPct = assumptions.fire?.safeWithdrawalRatePct ?? 4;
  const health = assumptions.fire?.annualHealthInsurance ?? 0;
  const essential = assumptions.fire?.essentialAnnualExpenses ?? assumptions.recurringAnnualExpenses;
  const primaryBirthYear = assumptions.people[0]?.birthYear ?? null;

  function setFire(patch: Partial<FireConfig>) {
    onChange({
      ...assumptions,
      fire: {
        safeWithdrawalRatePct: swrPct,
        annualHealthInsurance: health,
        essentialAnnualExpenses: essential,
        ...patch,
      },
    });
  }

  const fire = computeFire(rows, {
    recurringAnnualExpenses: assumptions.recurringAnnualExpenses,
    safeWithdrawalRatePct: swrPct,
    annualHealthInsurance: health,
    essentialAnnualExpenses: essential,
    returnPct: assumptions.investment.returnPct,
    inflationPct: assumptions.inflationPct,
    primaryBirthYear,
  });

  function status(m: FireMilestone): { text: string; ok: boolean } {
    if (!m.reached) return { text: t.fire.notReached, ok: false };
    return {
      text: m.age !== null ? t.fire.reachedAtAge(m.year!, m.age) : t.fire.reachedAt(m.year!),
      ok: true,
    };
  }

  const fullStatus = status(fire.full);
  const leanStatus = status(fire.lean);
  const showLean = fire.leanSpend < fire.fullSpend;

  const coastText = primaryBirthYear === null
    ? { text: t.fire.coastNeedsPerson, ok: false }
    : fire.coast.reached
      ? { text: t.fire.coastLine(fire.coast.year!, fire.coast.age!, fire.retirementAge), ok: true }
      : { text: t.fire.coastNotReached, ok: false };

  return (
    <section className="border-border rounded border p-4">
      <p className="text-muted text-[10px] tracking-[0.18em] uppercase">{t.fire.heading}</p>
      <p className="text-muted mt-1 text-xs">{t.fire.intro}</p>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <NumField
          label={t.fire.swr}
          value={swrPct}
          step={0.25}
          min={0.5}
          max={20}
          suffix="%"
          onChange={(n) => setFire({ safeWithdrawalRatePct: Math.min(20, Math.max(0.5, n)) })}
        />
        <NumField
          label={t.fire.healthInsurance}
          value={health}
          step={1000}
          min={0}
          suffix="$"
          onChange={(n) => setFire({ annualHealthInsurance: Math.max(0, n) })}
        />
        <NumField
          label={t.fire.essential}
          value={essential}
          step={1000}
          min={0}
          suffix="$"
          onChange={(n) => setFire({ essentialAnnualExpenses: Math.max(0, n) })}
        />
      </div>

      {fire.fullSpend <= 0 ? (
        <p className="text-muted mt-3 text-xs italic">{t.fire.needExpenses}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {/* Full FIRE */}
          <div className="border-border flex items-start justify-between gap-3 rounded border px-3 py-2">
            <div className="flex flex-col">
              <span className="text-foreground text-xs">{t.fire.fullLabel}</span>
              <span className="text-muted text-[10px]">{t.fire.covers(fmt.currency0(fire.fullSpend))}</span>
            </div>
            <div className="text-right">
              <span className="nums text-foreground block text-xs">{fmt.currency0(fire.full.number)}</span>
              <span className={`text-[10px] ${fullStatus.ok ? 'text-positive' : 'text-muted'}`}>
                {fullStatus.text}
              </span>
            </div>
          </div>

          {/* Lean FIRE — only when essential spend is lower than full. */}
          {showLean ? (
            <div className="border-border flex items-start justify-between gap-3 rounded border px-3 py-2">
              <div className="flex flex-col">
                <span className="text-foreground text-xs">{t.fire.leanLabel}</span>
                <span className="text-muted text-[10px]">{t.fire.covers(fmt.currency0(fire.leanSpend))}</span>
              </div>
              <div className="text-right">
                <span className="nums text-foreground block text-xs">{fmt.currency0(fire.lean.number)}</span>
                <span className={`text-[10px] ${leanStatus.ok ? 'text-positive' : 'text-muted'}`}>
                  {leanStatus.text}
                </span>
              </div>
            </div>
          ) : null}

          {/* Coast FIRE */}
          <div className="border-border flex items-start justify-between gap-3 rounded border px-3 py-2">
            <span className="text-foreground text-xs">{t.fire.coastLabel}</span>
            <span className={`text-right text-[10px] ${coastText.ok ? 'text-positive' : 'text-muted'}`}>
              {coastText.text}
            </span>
          </div>
        </div>
      )}

      <p className="text-muted mt-3 text-[10px] italic">{t.fire.disclaimer}</p>
    </section>
  );
}
