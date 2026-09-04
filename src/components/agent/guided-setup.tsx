'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { assumptionsSchema, type Assumptions } from '@/lib/validation/scenarios';

import { newId } from '../simulator/default-assumptions';
import PixelIcon, { PixelLabel } from '../pixel/pixel-icon';
import PixelGuide from './pixel-guide';

/**
 * Guided setup — the "simple" half of the local agent.
 *
 * Four plain-language questions instead of fifty inputs. Everything the
 * user doesn't answer is inferred from what they did (tax rate from
 * household income, horizon from age, a career stage from today's pay), and
 * every inferred value is a normal field they can still edit afterwards —
 * this writes a scenario, it doesn't own one.
 *
 * Deliberately not a chatbot: no network, no LLM. Just one question at a
 * time, which is the part of "conversational" that actually helps.
 */

type Answers = {
  age: number;
  income: number;
  partnerIncome: number;
  spending: number;
  netWorth: number;
};

const EMPTY: Answers = {
  age: 30,
  income: 150_000,
  partnerIncome: 0,
  spending: 60_000,
  netWorth: 50_000,
};

/**
 * Rough effective all-in rate (federal + state + payroll) by household
 * income. Illustrative — the form's tax presets do the detailed version.
 */
function estimateTaxPct(householdIncome: number): number {
  if (householdIncome < 100_000) return 22;
  if (householdIncome < 200_000) return 27;
  if (householdIncome < 400_000) return 32;
  if (householdIncome < 700_000) return 37;
  return 42;
}

/**
 * Clamp a raw <input type="number"> value into the schema's world. A field
 * accepts `1e999` (→ Infinity) and pasted junk (→ NaN); neither should ever
 * reach the engine, so they're squashed at the boundary — the same
 * treat-input-as-untrusted rule the JSON importer follows.
 */
function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const MONEY_CAP = 1e12; // matches the schema's money bound

export function buildFromAnswers(raw: Answers): Assumptions {
  const ans: Answers = {
    age: Math.round(clamp(raw.age, 16, 90, 30)),
    income: clamp(raw.income, 0, MONEY_CAP, 0),
    partnerIncome: clamp(raw.partnerIncome, 0, MONEY_CAP, 0),
    spending: clamp(raw.spending, 0, MONEY_CAP, 0),
    netWorth: clamp(raw.netWorth, 0, MONEY_CAP, 0),
  };
  const thisYear = new Date().getFullYear();
  const birthYear = thisYear - ans.age;
  const household = ans.income + ans.partnerIncome;

  // Retire at 65 unless the user says otherwise. Without this the generated
  // career stage pays a rising salary until the horizon ends at 90 — which
  // made the projection wildly optimistic (a 91-year-old still drawing
  // $4M/yr) and is the opposite of what this tool is for.
  const DEFAULT_RETIRE_AGE = 65;

  const person = (name: string, salary: number) => ({
    id: newId(),
    name,
    birthYear,
    retireAge: Math.max(ans.age + 1, DEFAULT_RETIRE_AGE),
    careerStages: [
      { label: name, startAge: ans.age, baseSalary: salary, annualRaisePct: 3, bonusPct: 0 },
    ],
  });

  return {
    horizonStartYear: thisYear,
    // Run to 90 so retirement and the drawdown years are visible — but never
    // shorter than 5 years, or someone already near 90 gets an empty chart.
    horizonEndYear: Math.max(birthYear + 90, thisYear + 5),
    people:
      ans.partnerIncome > 0
        ? [person('You', ans.income), person('Partner', ans.partnerIncome)]
        : [person('You', ans.income)],
    startingNetWorth: ans.netWorth,
    // Assume most of an existing balance is invested, but keep a cash buffer
    // — the two-pool model only compounds what's actually invested.
    startingInvested: Math.round(ans.netWorth * 0.8),
    investedSharePct: 80,
    effectiveTaxRatePct: estimateTaxPct(household),
    investment: { returnPct: 6, returnPctLow: 3, returnPctHigh: 9 },
    inflationPct: 3,
    windfalls: [],
    majorExpenses: [],
    recurringAnnualExpenses: ans.spending,
  };
}

export default function GuidedSetup({
  onComplete,
  onCancel,
  theme = 'dark',
}: {
  onComplete: (a: Assumptions) => void;
  onCancel: () => void;
  theme?: 'dark' | 'light';
}) {
  const { t, fmt } = useI18n();
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState<Answers>(EMPTY);

  const g = t.guided;
  const set = (patch: Partial<Answers>) => setAns((prev) => ({ ...prev, ...patch }));

  const steps = [
    { key: 'age', question: g.qAge, hint: g.qAgeHint },
    { key: 'income', question: g.qIncome, hint: g.qIncomeHint },
    { key: 'spending', question: g.qSpending, hint: g.qSpendingHint },
    { key: 'netWorth', question: g.qNetWorth, hint: g.qNetWorthHint },
  ] as const;

  const last = step === steps.length - 1;
  const current = steps[step]!;

  function next() {
    if (!last) {
      setStep((s) => s + 1);
      return;
    }
    // Belt and suspenders: the built scenario goes through the same schema
    // as an imported file before it can touch app state.
    const parsed = assumptionsSchema.safeParse(buildFromAnswers(ans));
    if (parsed.success) onComplete(parsed.data);
  }

  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <PixelLabel icon="spark">{g.heading}</PixelLabel>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          {g.skip}
        </button>
      </div>

      {/* progress dots — four questions, no scrollbar of inputs */}
      <div className="mb-5 flex gap-1.5">
        {steps.map((s, i) => (
          <span
            key={s.key}
            className={`h-1.5 flex-1 ${i <= step ? 'bg-accent' : 'bg-foreground/10'}`}
          />
        ))}
      </div>

      {/* The guide asks; you answer. It waves on each new question, and the
          little arrow points from the guide at what it's asking about. */}
      <div className="mb-4 flex items-start gap-2">
        <PixelGuide theme={theme} step={step} />
        <PixelIcon name="arrow" size={14} className="text-accent mt-3 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="serif-display mb-1 text-lg leading-snug sm:text-xl">{current.question}</p>
          <p className="text-muted text-[13px]">{current.hint}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="flex flex-col gap-3"
      >
        {step === 0 ? (
          <BigNumber
            value={ans.age}
            onChange={(v) => set({ age: Math.round(v) })}
            min={16}
            max={90}
            // An age of 0 is meaningless — an emptied field settles back to
            // the default rather than to zero.
            fallback={EMPTY.age}
          />
        ) : null}

        {step === 1 ? (
          <>
            <BigNumber
              value={ans.income}
              onChange={(v) => set({ income: v })}
              min={0}
              step={5000}
              prefix="$"
            />
            <label className="text-muted flex flex-col gap-1 text-xs">
              {g.partnerIncome}
              <input
                type="number"
                inputMode="decimal"
                value={ans.partnerIncome || ''}
                placeholder="0"
                min={0}
                step={5000}
                onChange={(e) => set({ partnerIncome: Number(e.target.value) || 0 })}
                className="field nums"
              />
            </label>
          </>
        ) : null}

        {step === 2 ? (
          <BigNumber
            value={ans.spending}
            onChange={(v) => set({ spending: v })}
            min={0}
            step={5000}
            prefix="$"
          />
        ) : null}

        {step === 3 ? (
          <BigNumber
            value={ans.netWorth}
            onChange={(v) => set({ netWorth: v })}
            min={0}
            step={10_000}
            prefix="$"
          />
        ) : null}

        {/* A live read of what they've told us — the "it's listening" signal. */}
        {step > 0 ? (
          <p className="text-muted nums text-xs">
            {g.soFar(
              ans.age,
              fmt.currency0(ans.income + ans.partnerIncome),
              step > 1 ? fmt.currency0(ans.spending) : '—',
            )}
          </p>
        ) : null}

        {/* Touch targets sized for thumbs; primary action first on mobile. */}
        <div className="mt-1 flex items-center gap-2">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="btn">
              {g.back}
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary flex-1 sm:flex-none">
            {last ? g.finish : g.next}
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * The big answer field. Keeps a local STRING buffer while the user is
 * typing, which is what makes clearing the field actually clear it: a
 * plain controlled `value={number}` turns an empty box back into "0" on
 * the very next render, so you can never delete the last digit — you have
 * to select-all and overtype. The buffer also protects half-typed input
 * ("", "-", "1.") from being parsed mid-keystroke.
 *
 * On blur an empty or unparseable buffer settles to `fallback`. Same
 * pattern as `NumField` in the assumptions form — kept in sync on purpose.
 */
function BigNumber({
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  fallback = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  fallback?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : value === 0 ? '' : String(value);

  return (
    <div className="flex items-center gap-2">
      {prefix ? <span className="text-muted serif-display text-2xl">{prefix}</span> : null}
      <input
        type="number"
        // Numeric keypad on phones, and 16px+ text so iOS doesn't zoom in.
        inputMode="decimal"
        autoFocus
        value={display}
        placeholder="0"
        min={min}
        max={max}
        step={step}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (next.trim() === '') return; // let the field be empty
          const n = Number(next);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          if (draft === null) return;
          const trimmed = draft.trim();
          if (trimmed === '' || !Number.isFinite(Number(trimmed))) onChange(fallback);
          setDraft(null);
        }}
        className="field figure nums h-[58px] text-[26px]"
      />
    </div>
  );
}
