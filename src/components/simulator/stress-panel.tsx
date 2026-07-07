'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { simulate, type YearRow } from '@/lib/simulator/engine';
import type { Assumptions, StressConfig } from '@/lib/validation/scenarios';

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

export default function StressPanel({
  assumptions,
  rows,
  onChange,
}: {
  assumptions: Assumptions;
  /** Baseline (no-stress) projection rows from the parent. */
  rows: YearRow[];
  onChange: (next: Assumptions) => void;
}) {
  const { t, fmt } = useI18n();
  const stress = assumptions.stress;
  const active = !!(stress?.jobLoss || stress?.marketShock);
  const nextYear = assumptions.horizonStartYear + 1;

  // Drop the whole `stress` key when neither shock is set (keeps scenarios clean).
  function setStress(next: StressConfig | undefined) {
    const cleaned = next && (next.jobLoss || next.marketShock) ? next : undefined;
    onChange({ ...assumptions, stress: cleaned });
  }
  function patchJobLoss(patch: Partial<NonNullable<StressConfig['jobLoss']>>) {
    if (!stress?.jobLoss) return;
    setStress({ ...stress, jobLoss: { ...stress.jobLoss, ...patch } });
  }
  function patchMarket(patch: Partial<NonNullable<StressConfig['marketShock']>>) {
    if (!stress?.marketShock) return;
    setStress({ ...stress, marketShock: { ...stress.marketShock, ...patch } });
  }

  const stressed = useMemo(
    () => (active ? simulate(assumptions, stress).rows : null),
    [assumptions, stress, active],
  );

  const baselineFinal = rows.at(-1)?.netWorth ?? 0;
  const impact = useMemo(() => {
    if (!stressed) return null;
    const finalNw = stressed.at(-1)?.netWorth ?? 0;
    let trough = stressed[0]!;
    for (const r of stressed) if (r.netWorth < trough.netWorth) trough = r;
    const delta = finalNw - baselineFinal;
    const pct = baselineFinal > 0 ? (delta / baselineFinal) * 100 : 0;
    return { finalNw, delta, pct, troughValue: trough.netWorth, troughYear: trough.year };
  }, [stressed, baselineFinal]);

  return (
    <section className="border-border rounded border p-4">
      <p className="text-muted text-[10px] tracking-[0.18em] uppercase">{t.stress.heading}</p>
      <p className="text-muted mt-1 text-xs">{t.stress.intro}</p>

      {/* Quick presets. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setStress({
              ...stress,
              jobLoss: { startYear: nextYear, years: 1, incomeReplacementPct: 0 },
            })
          }
          className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-[11px]"
        >
          {t.stress.presetJobLoss}
        </button>
        <button
          type="button"
          onClick={() => setStress({ ...stress, marketShock: { year: nextYear, returnPct: -37 } })}
          className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-[11px]"
        >
          {t.stress.presetCrash}
        </button>
      </div>

      {/* Job loss. */}
      <div className="border-border mt-3 rounded border p-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!stress?.jobLoss}
            onChange={(e) =>
              setStress({
                ...stress,
                jobLoss: e.target.checked
                  ? { startYear: nextYear, years: 1, incomeReplacementPct: 0 }
                  : undefined,
              })
            }
          />
          <span className="text-foreground">{t.stress.jobLossEnable}</span>
        </label>
        {stress?.jobLoss ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-muted text-xs">{t.stress.who}</span>
              <select
                value={stress.jobLoss.personId ?? ''}
                onChange={(e) => patchJobLoss({ personId: e.target.value || undefined })}
                className="border-border bg-background rounded border px-2 py-2 text-sm"
              >
                <option value="">{t.stress.everyone}</option>
                {assumptions.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <NumField
              label={t.stress.incomeKept}
              value={stress.jobLoss.incomeReplacementPct}
              step={5}
              min={0}
              max={100}
              suffix="%"
              onChange={(n) => patchJobLoss({ incomeReplacementPct: Math.min(100, Math.max(0, n)) })}
            />
            <NumField
              label={t.stress.startYear}
              value={stress.jobLoss.startYear}
              min={1900}
              max={2200}
              onChange={(n) => patchJobLoss({ startYear: Math.round(n) })}
            />
            <NumField
              label={t.stress.years}
              value={stress.jobLoss.years}
              min={1}
              max={50}
              onChange={(n) => patchJobLoss({ years: Math.max(1, Math.round(n)) })}
            />
          </div>
        ) : null}
      </div>

      {/* Market crash. */}
      <div className="border-border mt-3 rounded border p-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!stress?.marketShock}
            onChange={(e) =>
              setStress({
                ...stress,
                marketShock: e.target.checked ? { year: nextYear, returnPct: -37 } : undefined,
              })
            }
          />
          <span className="text-foreground">{t.stress.marketEnable}</span>
        </label>
        {stress?.marketShock ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <NumField
              label={t.stress.crashYear}
              value={stress.marketShock.year}
              min={1900}
              max={2200}
              onChange={(n) => patchMarket({ year: Math.round(n) })}
            />
            <NumField
              label={t.stress.crashReturn}
              value={stress.marketShock.returnPct}
              step={1}
              min={-90}
              max={100}
              suffix="%"
              onChange={(n) => patchMarket({ returnPct: Math.min(100, Math.max(-90, n)) })}
            />
          </div>
        ) : null}
      </div>

      {/* Impact. */}
      <div className="mt-3 flex flex-col gap-1">
        <p className="text-muted nums text-[11px]">{t.stress.baselineFinal(fmt.currency0(baselineFinal))}</p>
        {impact ? (
          <>
            <p className="nums text-xs">
              {t.stress.stressedFinal(
                fmt.currency0(impact.finalNw),
                fmt.currencyDelta(impact.delta),
                fmt.signedPct1(impact.pct),
              )}
            </p>
            <p className="text-muted nums text-[11px]">
              {t.stress.trough(fmt.currency0(impact.troughValue), impact.troughYear)}
            </p>
          </>
        ) : (
          <p className="text-muted text-[11px] italic">{t.stress.none}</p>
        )}
      </div>

      <p className="text-muted mt-3 text-[10px] italic">{t.stress.disclaimer}</p>
    </section>
  );
}
