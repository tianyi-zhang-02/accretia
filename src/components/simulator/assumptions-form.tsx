'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { CAREER_PRESETS } from '@/lib/simulator/career-presets';
import {
  ROLE_PRESETS,
  searchRolePresets,
  type RolePreset,
  type RoleTrack,
} from '@/lib/simulator/rolePresets';
import { estimateEffectiveTaxRate, STATE_TAXES, TAX_LAST_REVIEWED } from '@/lib/simulator/tax-presets';
import type {
  Assumptions,
  CareerStage,
  ExpenseKind,
  Lifestyle,
  MajorExpense,
  MortgageConfig,
  Person,
  Windfall,
} from '@/lib/validation/scenarios';

import { newId } from './default-assumptions';

type Setter = (next: Assumptions) => void;

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-border rounded border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[11px] tracking-[0.2em] uppercase">{title}</span>
        <span className="text-muted text-xs">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="border-border border-t px-4 py-4">{children}</div> : null}
    </section>
  );
}

/**
 * Numeric input that fixes the "type-and-prepend-0" UX bug. Keeps a local
 * string buffer while editing so clearing / "-" / "1." mid-decimal don't get
 * clobbered; on blur an empty/garbage buffer falls back to 0. This avoids the
 * React `set-state-in-effect` lint and fight-the-cursor re-syncing bugs.
 */
function NumField({
  label,
  value,
  step = 1,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
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
          step={step}
          min={min}
          max={max}
          value={display}
          placeholder="0"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (next.trim() === '') return;
            const n = Number(next);
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
        {suffix ? <span className="text-muted text-xs">{suffix}</span> : null}
      </div>
    </label>
  );
}

/**
 * Inline role-library browser/search for a career stage. Clicking a role fills
 * baseSalary / annualRaisePct / bonusPct / annualEquity; everything stays
 * editable afterward. Role titles/notes are library data (kept as-is);
 * surrounding chrome is localized.
 */
function RoleSearchBox({ onPick }: { onPick: (preset: RolePreset) => void }) {
  const { t, fmt, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const groups = useMemo<Array<[RoleTrack, RolePreset[]]>>(() => {
    const byTrack = new Map<RoleTrack, RolePreset[]>();
    for (const r of searchRolePresets(query)) {
      const arr = byTrack.get(r.track) ?? [];
      arr.push(r);
      byTrack.set(r.track, arr);
    }
    return [...byTrack.entries()];
  }, [query]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={t.form.role.searchPlaceholder(ROLE_PRESETS.length)}
        className="border-border focus:border-foreground placeholder:text-muted/50 w-full rounded border bg-transparent px-3 py-2 text-xs outline-none"
      />
      {open ? (
        <div
          className="border-border bg-background absolute top-full right-0 left-0 z-10 mt-1 max-h-80 overflow-auto rounded border shadow-lg"
          role="listbox"
        >
          {groups.length === 0 ? (
            <p className="text-muted px-3 py-3 text-[11px]">{t.form.role.noMatch(query)}</p>
          ) : (
            groups.map(([track, roles]) => (
              <div key={track}>
                <p className="text-muted bg-background/95 sticky top-0 px-3 py-1.5 text-[10px] font-medium tracking-[0.16em] uppercase backdrop-blur">
                  {t.presets.track[track]}
                </p>
                <ul>
                  {roles.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onPick(r);
                          setQuery('');
                          setOpen(false);
                        }}
                        className="hover:bg-foreground/5 flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
                      >
                        <span className="text-foreground text-xs">
                          {locale === 'zh' ? r.titleZh : r.title}
                        </span>
                        <span className="text-muted nums text-[10px]">
                          {fmt.currency0(r.baseSalary)} {t.form.role.base} · +{r.annualRaisePct}% ·{' '}
                          {r.bonusPct}% {t.form.role.bonus}
                          {r.annualEquity > 0
                            ? ` · ${fmt.currency0(r.annualEquity)} ${t.form.role.equity}`
                            : ''}
                        </span>
                        {(locale === 'zh' ? r.notesZh : r.notes) ? (
                          <span className="text-muted text-[10px] italic">
                            {locale === 'zh' ? r.notesZh : r.notes}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-xs">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="border-border focus:border-foreground placeholder:text-muted/50 rounded border bg-transparent px-3 py-2 text-base outline-none"
      />
    </label>
  );
}

/**
 * UI for `assumptions.lifestyle`. Absent state = flat 0% creep. Setting the
 * mode dropdown to "Off" drops the key back to undefined.
 */
function LifestyleEditor({
  value,
  onChange,
}: {
  value: Lifestyle | undefined;
  onChange: (next: Lifestyle | undefined) => void;
}) {
  const { t } = useI18n();
  const mode: 'off' | 'flat' | 'incomeScaled' = value?.mode ?? 'off';

  function setMode(next: 'off' | 'flat' | 'incomeScaled') {
    if (next === 'off') {
      onChange(undefined);
      return;
    }
    onChange({
      mode: next,
      lifestyleCreepPct: value?.lifestyleCreepPct ?? 1,
      creepShareOfRaisePct: value?.creepShareOfRaisePct ?? 50,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">{t.form.lifestyle.mode}</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'off' | 'flat' | 'incomeScaled')}
          className="border-border bg-background rounded border px-3 py-2 text-sm"
        >
          <option value="off">{t.form.lifestyle.off}</option>
          <option value="flat">{t.form.lifestyle.flat}</option>
          <option value="incomeScaled">{t.form.lifestyle.incomeScaled}</option>
        </select>
      </label>

      {mode === 'flat' && value ? (
        <NumField
          label={t.form.lifestyle.creepAboveInflation}
          value={value.lifestyleCreepPct}
          step={0.25}
          min={-50}
          max={50}
          onChange={(n) => onChange({ ...value, lifestyleCreepPct: n })}
          suffix="%/yr"
        />
      ) : null}

      {mode === 'incomeScaled' && value ? (
        <NumField
          label={t.form.lifestyle.shareOfRaise}
          value={value.creepShareOfRaisePct}
          step={5}
          min={0}
          max={100}
          onChange={(n) => onChange({ ...value, creepShareOfRaisePct: n })}
          suffix="%"
        />
      ) : null}

      <p className="text-muted text-[10px]">{t.form.lifestyle.explainer}</p>
    </div>
  );
}

/**
 * Seeds `effectiveTaxRatePct` from a rough state + federal estimate.
 * Illustrative only — see `tax-presets.ts`.
 */
function TaxEstimator({
  currentRate,
  onApply,
}: {
  currentRate: number;
  onApply: (rate: number) => void;
}) {
  const { t } = useI18n();
  const [stateCode, setStateCode] = useState('CA');
  const [income, setIncome] = useState('250000');
  const incomeNum = Number(income);
  const estimate = estimateEffectiveTaxRate(stateCode, Number.isFinite(incomeNum) ? incomeNum : 0);

  return (
    <div className="border-border flex flex-col gap-2 rounded border p-3">
      <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
        {t.form.taxes.estimateHeading}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs">{t.form.taxes.state}</span>
          <select
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className="border-border bg-background rounded border px-2 py-2 text-sm"
          >
            {STATE_TAXES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs">{t.form.taxes.grossIncome}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step={10000}
              min={0}
              value={income}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setIncome(e.target.value)}
              className="border-border focus:border-foreground nums w-full rounded border bg-transparent px-2 py-2 text-sm outline-none"
            />
            <span className="text-muted text-xs">$</span>
          </div>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          {t.form.taxes.estimatedEffective} <span className="nums font-medium">{estimate}%</span>
        </span>
        <button
          type="button"
          onClick={() => onApply(estimate)}
          disabled={estimate === currentRate}
          className="bg-foreground text-background rounded px-3 py-1 text-xs font-medium disabled:opacity-40"
        >
          {t.form.taxes.apply}
        </button>
      </div>
      <p className="text-muted text-[10px] italic">{t.form.taxes.note(TAX_LAST_REVIEWED)}</p>
    </div>
  );
}

type AllocBucket = { label: string; weightPct: number; returnPct: number; costPct: number };

/**
 * Blends a single expected return from a rough asset mix. Each bucket's net
 * return is `return − cost` (cost = carrying cost, e.g. property tax on real
 * estate); the blend is the weight-normalized average. Transient (like
 * TaxEstimator) — it computes and Applies to the return band, nothing is
 * persisted. Illustrative, no engine change.
 */
function AllocationEstimator({ onApply }: { onApply: (blendedReturn: number) => void }) {
  const { t, fmt } = useI18n();
  const [buckets, setBuckets] = useState<AllocBucket[]>(() => [
    { label: t.form.allocation.stocks, weightPct: 60, returnPct: 7, costPct: 0 },
    { label: t.form.allocation.hysavings, weightPct: 20, returnPct: 3.5, costPct: 0 },
    { label: t.form.allocation.bonds, weightPct: 10, returnPct: 4, costPct: 0 },
    { label: t.form.allocation.realestate, weightPct: 10, returnPct: 4, costPct: 1.2 },
  ]);

  const totalWeight = buckets.reduce((s, b) => s + (b.weightPct || 0), 0);
  const blended =
    totalWeight > 0
      ? buckets.reduce((s, b) => s + (b.weightPct / totalWeight) * (b.returnPct - b.costPct), 0)
      : 0;

  function patch(i: number, p: Partial<AllocBucket>) {
    setBuckets((arr) => arr.map((b, j) => (j === i ? { ...b, ...p } : b)));
  }

  return (
    <div className="border-border flex flex-col gap-2 rounded border p-3">
      <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
        {t.form.allocation.heading}
      </p>
      <div className="flex flex-col gap-2">
        {buckets.map((b, i) => (
          <div key={i} className="border-border rounded border p-2">
            <TextField
              label={t.form.allocation.asset}
              value={b.label}
              onChange={(v) => patch(i, { label: v })}
            />
            <div className="mt-2 grid grid-cols-3 gap-2">
              <NumField
                label={t.form.allocation.weight}
                value={b.weightPct}
                step={5}
                min={0}
                suffix="%"
                onChange={(n) => patch(i, { weightPct: Math.max(0, n) })}
              />
              <NumField
                label={t.form.allocation.ret}
                value={b.returnPct}
                step={0.25}
                suffix="%"
                onChange={(n) => patch(i, { returnPct: n })}
              />
              <NumField
                label={t.form.allocation.cost}
                value={b.costPct}
                step={0.25}
                min={0}
                suffix="%"
                onChange={(n) => patch(i, { costPct: Math.max(0, n) })}
              />
            </div>
            <button
              type="button"
              onClick={() => setBuckets((arr) => arr.filter((_, j) => j !== i))}
              className="text-muted hover:text-negative mt-1 text-[11px]"
            >
              {t.form.allocation.remove}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setBuckets((arr) => [
            ...arr,
            { label: t.form.allocation.asset, weightPct: 0, returnPct: 5, costPct: 0 },
          ])
        }
        className="border-border hover:bg-foreground/5 self-start rounded border px-3 py-1 text-[11px]"
      >
        {t.form.allocation.addBucket}
      </button>
      <p className="text-muted text-[11px]">{t.form.allocation.totalWeight(Math.round(totalWeight))}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">{t.form.allocation.blended(fmt.pct(blended, 1))}</span>
        <button
          type="button"
          onClick={() => onApply(Number(blended.toFixed(1)))}
          className="bg-foreground text-background rounded px-3 py-1 text-xs font-medium"
        >
          {t.form.allocation.apply}
        </button>
      </div>
      <p className="text-muted text-[10px] italic">{t.form.allocation.note}</p>
    </div>
  );
}

/** Home + mortgage editor. When enabled, the engine adds a home asset and a
 * mortgage liability to net worth; shows the monthly P&I payment. */
function MortgageEditor({
  value,
  defaultYear,
  onChange,
}: {
  value: MortgageConfig | undefined;
  defaultYear: number;
  onChange: (next: MortgageConfig | undefined) => void;
}) {
  const { t, fmt } = useI18n();
  function patch(p: Partial<MortgageConfig>) {
    if (!value) return;
    onChange({ ...value, ...p });
  }
  const loan = value ? value.homePrice * (1 - value.downPaymentPct / 100) : 0;
  const r = value ? value.mortgageRatePct / 100 : 0;
  const term = value?.termYears ?? 0;
  const annual =
    !value || loan <= 0 || term <= 0
      ? 0
      : r === 0
        ? loan / term
        : (loan * r) / (1 - Math.pow(1 + r, -term));

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? {
                    purchaseYear: defaultYear,
                    homePrice: 500_000,
                    downPaymentPct: 20,
                    mortgageRatePct: 6.5,
                    termYears: 30,
                    propertyTaxPct: 1.1,
                    maintenancePct: 1,
                    homeAppreciationPct: 3,
                  }
                : undefined,
            )
          }
        />
        <span className="text-foreground">{t.form.mortgage.enable}</span>
      </label>
      {value ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label={t.form.mortgage.purchaseYear}
              value={value.purchaseYear}
              min={1900}
              max={2200}
              onChange={(n) => patch({ purchaseYear: Math.round(n) })}
            />
            <NumField
              label={t.form.mortgage.homePrice}
              value={value.homePrice}
              step={10000}
              min={0}
              suffix="$"
              onChange={(n) => patch({ homePrice: Math.max(0, n) })}
            />
            <NumField
              label={t.form.mortgage.downPayment}
              value={value.downPaymentPct}
              step={5}
              min={0}
              max={100}
              suffix="%"
              onChange={(n) => patch({ downPaymentPct: Math.min(100, Math.max(0, n)) })}
            />
            <NumField
              label={t.form.mortgage.rate}
              value={value.mortgageRatePct}
              step={0.25}
              min={0}
              max={30}
              suffix="%"
              onChange={(n) => patch({ mortgageRatePct: Math.max(0, n) })}
            />
            <NumField
              label={t.form.mortgage.term}
              value={value.termYears}
              step={1}
              min={1}
              max={50}
              onChange={(n) => patch({ termYears: Math.max(1, Math.round(n)) })}
            />
            <NumField
              label={t.form.mortgage.propertyTax}
              value={value.propertyTaxPct}
              step={0.1}
              min={0}
              max={10}
              suffix="%"
              onChange={(n) => patch({ propertyTaxPct: Math.max(0, n) })}
            />
            <NumField
              label={t.form.mortgage.maintenance}
              value={value.maintenancePct ?? 0}
              step={0.25}
              min={0}
              max={10}
              suffix="%"
              onChange={(n) => patch({ maintenancePct: Math.max(0, n) })}
            />
            <NumField
              label={t.form.mortgage.appreciation}
              value={value.homeAppreciationPct ?? 0}
              step={0.5}
              suffix="%"
              onChange={(n) => patch({ homeAppreciationPct: n })}
            />
          </div>
          <p className="text-muted nums text-[11px]">
            {t.form.mortgage.monthlyPayment(fmt.currency0(annual / 12))}
          </p>
        </>
      ) : null}
      <p className="text-muted text-[10px] italic">{t.form.mortgage.note}</p>
    </div>
  );
}

export default function AssumptionsForm({ value, onChange }: { value: Assumptions; onChange: Setter }) {
  // The asset-mix estimator gets its own inline disclosure (it used to hide
  // behind the global "advanced tools" toggle in the OTHER column — a
  // cross-column dependency nobody could find).
  const [showAllocation, setShowAllocation] = useState(false);
  const { t } = useI18n();

  function update(patch: Partial<Assumptions>) {
    onChange({ ...value, ...patch });
  }

  // ----------------- People helpers -----------------
  function setPeople(people: Person[]) {
    update({ people });
  }

  function addPerson() {
    setPeople([
      ...value.people,
      {
        id: newId(),
        name: t.form.person.defaultName(value.people.length + 1),
        birthYear: 1995,
        careerStages: [],
      },
    ]);
  }

  function patchPerson(personId: string, patch: Partial<Person>) {
    setPeople(value.people.map((p) => (p.id === personId ? { ...p, ...patch } : p)));
  }

  function removePerson(personId: string) {
    setPeople(value.people.filter((p) => p.id !== personId));
  }

  function setStages(personId: string, stages: CareerStage[]) {
    patchPerson(personId, { careerStages: stages });
  }

  function addStage(personId: string) {
    const p = value.people.find((x) => x.id === personId);
    if (!p) return;
    setStages(personId, [
      ...p.careerStages,
      { label: t.form.person.newStageLabel, startAge: 22, baseSalary: 100_000, annualRaisePct: 3 },
    ]);
  }

  function patchStage(personId: string, idx: number, patch: Partial<CareerStage>) {
    const p = value.people.find((x) => x.id === personId);
    if (!p) return;
    setStages(
      personId,
      p.careerStages.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }

  function removeStage(personId: string, idx: number) {
    const p = value.people.find((x) => x.id === personId);
    if (!p) return;
    setStages(
      personId,
      p.careerStages.filter((_, i) => i !== idx),
    );
  }

  function applyPreset(personId: string, presetId: string) {
    const preset = CAREER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setStages(
      personId,
      preset.stages.map((s) => ({ ...s })),
    );
  }

  // ----------------- Windfalls helpers -----------------
  function setWindfalls(windfalls: Windfall[]) {
    update({ windfalls });
  }

  // ----------------- Major-expenses helpers -----------------
  function setMajor(majorExpenses: MajorExpense[]) {
    update({ majorExpenses });
  }

  return (
    <div className="flex flex-col gap-3">
      <Section title={t.form.section.horizon} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label={t.form.horizon.startYear}
            value={value.horizonStartYear}
            min={1900}
            max={2200}
            onChange={(n) => update({ horizonStartYear: Math.round(n) })}
          />
          <NumField
            label={t.form.horizon.endYear}
            value={value.horizonEndYear}
            min={1900}
            max={2200}
            onChange={(n) => update({ horizonEndYear: Math.round(n) })}
          />
        </div>
      </Section>

      <Section title={t.form.section.startingState}>
        <div className="grid grid-cols-1 gap-3">
          <NumField
            label={t.form.starting.netWorth}
            value={value.startingNetWorth}
            step={1000}
            onChange={(n) => update({ startingNetWorth: n })}
            suffix="$"
          />
          <NumField
            label={t.form.starting.invested}
            value={value.startingInvested}
            step={1000}
            min={0}
            onChange={(n) => update({ startingInvested: n })}
            suffix="$"
          />
          <NumField
            label={t.form.starting.expenses}
            value={value.recurringAnnualExpenses}
            step={1000}
            min={0}
            onChange={(n) => update({ recurringAnnualExpenses: n })}
            suffix="$"
          />
          <NumField
            label={t.form.starting.investedShare}
            value={value.investedSharePct ?? 100}
            step={5}
            min={0}
            max={100}
            onChange={(n) => update({ investedSharePct: Math.min(100, Math.max(0, n)) })}
            suffix="%"
          />
          <p className="text-muted text-[10px]">{t.form.starting.investedShareHint}</p>
        </div>
      </Section>

      <Section title={t.form.section.taxes} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <TaxEstimator
            currentRate={value.effectiveTaxRatePct}
            onApply={(rate) => update({ effectiveTaxRatePct: rate })}
          />
          <NumField
            label={t.form.taxes.effectiveRate}
            value={value.effectiveTaxRatePct}
            step={1}
            min={0}
            max={80}
            onChange={(n) => update({ effectiveTaxRatePct: n })}
            suffix="%"
          />
          <p className="text-muted text-[10px]">{t.form.taxes.savingsDerivedNote}</p>
        </div>
      </Section>

      <Section title={t.form.section.lifestyleCreep} defaultOpen={false}>
        <LifestyleEditor value={value.lifestyle} onChange={(next) => update({ lifestyle: next })} />
      </Section>

      <Section title={t.form.section.investmentInflation}>
        <div className="grid grid-cols-1 gap-3">
          <NumField
            label={t.form.investment.inflation}
            value={value.inflationPct}
            step={0.25}
            onChange={(n) => update({ inflationPct: n })}
            suffix="%"
          />
          <button
            type="button"
            onClick={() => setShowAllocation((v) => !v)}
            className="text-muted hover:text-foreground self-start text-[11px] underline-offset-2 hover:underline"
          >
            {showAllocation ? '− ' : '+ '}
            {t.form.allocation.heading}
          </button>
          {showAllocation ? (
            <AllocationEstimator
              onApply={(blended) => {
                const base = Math.max(-50, Math.min(100, blended));
                update({
                  investment: {
                    returnPct: base,
                    returnPctLow: Math.max(-50, Math.min(base, Number((base - 2).toFixed(2)))),
                    returnPctHigh: Math.min(100, Math.max(base, Number((base + 2).toFixed(2)))),
                  },
                });
              }}
            />
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <NumField
              label={t.form.investment.returnLow}
              value={value.investment.returnPctLow}
              step={0.25}
              onChange={(n) => update({ investment: { ...value.investment, returnPctLow: n } })}
              suffix="%"
            />
            <NumField
              label={t.form.investment.returnBase}
              value={value.investment.returnPct}
              step={0.25}
              onChange={(n) => update({ investment: { ...value.investment, returnPct: n } })}
              suffix="%"
            />
            <NumField
              label={t.form.investment.returnHigh}
              value={value.investment.returnPctHigh}
              step={0.25}
              onChange={(n) => update({ investment: { ...value.investment, returnPctHigh: n } })}
              suffix="%"
            />
          </div>
          <p className="text-muted text-[10px]">{t.form.investment.constraint}</p>
        </div>
      </Section>

      <Section title={t.form.section.peopleCareers(value.people.length)}>
        <div className="flex flex-col gap-4">
          {value.people.map((p) => (
            <div key={p.id} className="border-border rounded border p-3">
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label={t.form.person.name}
                  value={p.name}
                  maxLength={80}
                  onChange={(s) => patchPerson(p.id, { name: s })}
                />
                <NumField
                  label={t.form.person.birthYear}
                  value={p.birthYear}
                  min={1900}
                  max={2200}
                  onChange={(n) => patchPerson(p.id, { birthYear: Math.round(n) })}
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-muted text-[10px] tracking-[0.18em] uppercase">
                  {t.form.person.careerStages(p.careerStages.length)}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    className="border-border bg-background rounded border px-2 py-1 text-[11px]"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        applyPreset(p.id, e.target.value);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="" disabled>
                      {t.form.person.pickPreset}
                    </option>
                    {CAREER_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => addStage(p.id)}
                    className="border-border hover:bg-foreground/5 rounded border px-2 py-1 text-[11px]"
                  >
                    {t.form.person.addStage}
                  </button>
                </div>
              </div>

              {p.careerStages.length === 0 ? (
                <p className="text-muted mt-2 text-xs italic">{t.form.person.noStages}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {p.careerStages.map((s, i) => (
                    <li key={i} className="border-border rounded border p-3">
                      <div className="mb-3 flex flex-col gap-1">
                        <span className="text-muted text-[10px] tracking-[0.18em] uppercase">
                          {t.form.person.roleLibrary}
                        </span>
                        <RoleSearchBox
                          onPick={(preset) =>
                            patchStage(p.id, i, {
                              baseSalary: preset.baseSalary,
                              annualRaisePct: preset.annualRaisePct,
                              bonusPct: preset.bonusPct,
                              annualEquity: preset.annualEquity,
                            })
                          }
                        />
                        <span className="text-muted text-[10px] italic">
                          {t.form.person.startingEstimates}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <TextField
                          label={t.form.person.label}
                          value={s.label}
                          onChange={(v) => patchStage(p.id, i, { label: v })}
                        />
                        <NumField
                          label={t.form.person.startsAtAge}
                          value={s.startAge}
                          min={0}
                          max={120}
                          onChange={(v) => patchStage(p.id, i, { startAge: v })}
                        />
                        <NumField
                          label={t.form.person.baseSalary}
                          value={s.baseSalary}
                          step={1000}
                          min={0}
                          onChange={(v) => patchStage(p.id, i, { baseSalary: v })}
                          suffix="$"
                        />
                        <NumField
                          label={t.form.person.annualRaise}
                          value={s.annualRaisePct}
                          step={0.5}
                          onChange={(v) => patchStage(p.id, i, { annualRaisePct: v })}
                          suffix="%"
                        />
                        <NumField
                          label={t.form.person.bonusPct}
                          value={s.bonusPct ?? 0}
                          step={1}
                          min={0}
                          onChange={(v) => patchStage(p.id, i, { bonusPct: v })}
                          suffix="%"
                        />
                        <NumField
                          label={t.form.person.equityPerYear}
                          value={s.annualEquity ?? 0}
                          step={5000}
                          min={0}
                          onChange={(v) => patchStage(p.id, i, { annualEquity: v })}
                          suffix="$"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStage(p.id, i)}
                        className="text-muted hover:text-negative mt-2 text-[11px]"
                      >
                        {t.form.person.removeStage}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => removePerson(p.id)}
                className="text-muted hover:text-negative mt-3 text-[11px]"
              >
                {t.form.person.removePerson}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPerson}
            className="border-border hover:bg-foreground/5 self-start rounded border px-3 py-1.5 text-xs"
          >
            {t.form.person.addPerson}
          </button>
        </div>
      </Section>

      <Section title={t.form.section.windfalls(value.windfalls.length)} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          {value.windfalls.map((w, i) => (
            <div key={i} className="border-border rounded border p-3">
              <div className="grid grid-cols-3 gap-3">
                <TextField
                  label={t.form.windfall.label}
                  value={w.label}
                  onChange={(v) =>
                    setWindfalls(value.windfalls.map((x, j) => (j === i ? { ...x, label: v } : x)))
                  }
                />
                <NumField
                  label={t.form.windfall.year}
                  value={w.year}
                  onChange={(v) =>
                    setWindfalls(
                      value.windfalls.map((x, j) => (j === i ? { ...x, year: Math.round(v) } : x)),
                    )
                  }
                />
                <NumField
                  label={t.form.windfall.amount}
                  value={w.amount}
                  step={1000}
                  onChange={(v) =>
                    setWindfalls(value.windfalls.map((x, j) => (j === i ? { ...x, amount: v } : x)))
                  }
                  suffix="$"
                />
              </div>
              <button
                type="button"
                onClick={() => setWindfalls(value.windfalls.filter((_, j) => j !== i))}
                className="text-muted hover:text-negative mt-2 text-[11px]"
              >
                {t.form.windfall.remove}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setWindfalls([
                ...value.windfalls,
                { label: t.form.windfall.defaultLabel, year: value.horizonStartYear, amount: 10_000 },
              ])
            }
            className="border-border hover:bg-foreground/5 self-start rounded border px-3 py-1.5 text-xs"
          >
            {t.form.windfall.add}
          </button>
        </div>
      </Section>

      <Section title={t.form.section.majorExpenses(value.majorExpenses.length)} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          {value.majorExpenses.map((e, i) => {
            const isRecurring = !('year' in e);
            return (
              <div key={i} className="border-border rounded border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-muted text-[10px] tracking-[0.18em] uppercase">
                    {isRecurring ? t.form.major.recurring : t.form.major.oneTime}
                  </span>
                  <button
                    type="button"
                    className="text-muted hover:text-foreground text-[11px] underline-offset-2 hover:underline"
                    onClick={() => {
                      setMajor(
                        value.majorExpenses.map((x, j) => {
                          if (j !== i) return x;
                          return isRecurring
                            ? { label: x.label, year: value.horizonStartYear, amount: 10_000 }
                            : {
                                label: x.label,
                                startYear: value.horizonStartYear,
                                annualAmount: 10_000,
                                years: 5,
                              };
                        }),
                      );
                    }}
                  >
                    {isRecurring ? t.form.major.switchToOneTime : t.form.major.switchToRecurring}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label={t.form.major.label}
                    value={e.label}
                    onChange={(v) =>
                      setMajor(value.majorExpenses.map((x, j) => (j === i ? { ...x, label: v } : x)))
                    }
                  />
                  <label className="flex flex-col gap-1">
                    <span className="text-muted text-xs">{t.form.major.kind}</span>
                    <select
                      value={e.kind ?? 'other'}
                      onChange={(ev) =>
                        setMajor(
                          value.majorExpenses.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  kind:
                                    ev.target.value === 'other'
                                      ? undefined
                                      : (ev.target.value as ExpenseKind),
                                }
                              : x,
                          ),
                        )
                      }
                      className="border-border bg-background rounded border px-2 py-2 text-sm"
                    >
                      {(['other', 'car', 'house', 'boat', 'travel'] as const).map((k) => (
                        <option key={k} value={k}>
                          {t.form.major.kinds[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {'year' in e ? (
                    <>
                      <NumField
                        label={t.form.major.year}
                        value={e.year}
                        onChange={(v) =>
                          setMajor(
                            value.majorExpenses.map((x, j) =>
                              j === i && 'year' in x ? { ...x, year: Math.round(v) } : x,
                            ),
                          )
                        }
                      />
                      <NumField
                        label={t.form.major.amount}
                        value={e.amount}
                        step={1000}
                        onChange={(v) =>
                          setMajor(
                            value.majorExpenses.map((x, j) =>
                              j === i && 'year' in x ? { ...x, amount: v } : x,
                            ),
                          )
                        }
                        suffix="$"
                      />
                    </>
                  ) : (
                    <>
                      <NumField
                        label={t.form.major.startYear}
                        value={e.startYear}
                        onChange={(v) =>
                          setMajor(
                            value.majorExpenses.map((x, j) =>
                              j === i && 'startYear' in x ? { ...x, startYear: Math.round(v) } : x,
                            ),
                          )
                        }
                      />
                      <NumField
                        label={t.form.major.annualAmount}
                        value={e.annualAmount}
                        step={1000}
                        onChange={(v) =>
                          setMajor(
                            value.majorExpenses.map((x, j) =>
                              j === i && 'startYear' in x ? { ...x, annualAmount: v } : x,
                            ),
                          )
                        }
                        suffix="$"
                      />
                      <NumField
                        label={t.form.major.years}
                        value={e.years}
                        min={1}
                        max={200}
                        onChange={(v) =>
                          setMajor(
                            value.majorExpenses.map((x, j) =>
                              j === i && 'startYear' in x
                                ? { ...x, years: Math.max(1, Math.round(v)) }
                                : x,
                            ),
                          )
                        }
                      />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setMajor(value.majorExpenses.filter((_, j) => j !== i))}
                  className="text-muted hover:text-negative mt-2 text-[11px]"
                >
                  {t.form.major.remove}
                </button>
              </div>
            );
          })}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setMajor([
                  ...value.majorExpenses,
                  { label: t.form.major.defaultOneTimeLabel, year: value.horizonStartYear, amount: 50_000 },
                ])
              }
              className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
            >
              {t.form.major.addOneTime}
            </button>
            <button
              type="button"
              onClick={() =>
                setMajor([
                  ...value.majorExpenses,
                  {
                    label: t.form.major.defaultRecurringLabel,
                    startYear: value.horizonStartYear,
                    annualAmount: 10_000,
                    years: 5,
                  },
                ])
              }
              className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
            >
              {t.form.major.addRecurring}
            </button>
          </div>
        </div>
      </Section>

      <Section title={t.form.section.mortgage} defaultOpen={false}>
        <MortgageEditor
          value={value.mortgage}
          defaultYear={value.horizonStartYear + 1}
          onChange={(next) => update({ mortgage: next })}
        />
      </Section>
    </div>
  );
}
