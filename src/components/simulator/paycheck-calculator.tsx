'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { STATE_TAXES } from '@/lib/simulator/tax-presets';
import {
  CA_TAX_YEAR,
  exactState as isExactState,
  K401_LIMIT,
  K401_LIMIT_50_PLUS,
  NO_WAGE_TAX_STATES,
  paycheck,
  TAX_YEAR,
  type FilingStatus,
} from '@/lib/tax/paycheck';

import { SectionLabel } from '../ui/icon';

/**
 * Gross pay → take-home, laid out like a budget sheet: income, pre-tax
 * deductions, each tax, then the year / month / paycheck / bonus figures.
 * Pure arithmetic over published tables (lib/tax/paycheck.ts); nothing is
 * stored and nothing leaves the page.
 */

const money = (raw: string): number => {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0;
};
const pct = (raw: string): number => {
  const n = Number(raw.replace(/[%\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function Field({
  label,
  value,
  onChange,
  placeholder = '0',
  prefix = '$',
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-xs">{label}</span>
      <span className="relative">
        {prefix ? (
          <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px]">
            {prefix}
          </span>
        ) : null}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`field nums h-10 min-h-0 w-full text-right text-[15px] ${prefix ? 'field-money' : ''} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix ? (
          <span className="text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px]">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function PaycheckCalculator({
  onApplyRate,
}: {
  /** Put the computed effective tax rate (%) into the plan. */
  onApplyRate: (pct: number) => void;
}) {
  const { t, fmt } = useI18n();
  const P = t.paycheck;
  const [open, setOpen] = useState(false);
  const [salary, setSalary] = useState('');
  const [bonus, setBonus] = useState('');
  const [filing, setFiling] = useState<FilingStatus>('single');
  const [state, setState] = useState('CA');
  const [stateRate, setStateRate] = useState<string | null>(null);
  const [cityRate, setCityRate] = useState('');
  const [nyc, setNyc] = useState(false);
  const [k401, setK401] = useState('');
  const [age50, setAge50] = useState(false);
  const [hsa, setHsa] = useState('');
  const [other, setOther] = useState('');

  const exactState = isExactState(state);
  const noTax = (NO_WAGE_TAX_STATES as readonly string[]).includes(state);
  const ny = state === 'NY';
  const presetRate = STATE_TAXES.find((s) => s.code === state)?.rate ?? 0;

  const r = useMemo(
    () =>
      paycheck({
        salary: money(salary),
        bonus: money(bonus),
        filing,
        state,
        stateRatePct: stateRate === null ? presetRate : pct(stateRate),
        cityRatePct: pct(cityRate),
        nyc: ny && nyc,
        k401: money(k401),
        age50Plus: age50,
        hsa: money(hsa),
        otherPretax: money(other),
      }),
    [
      salary,
      bonus,
      filing,
      state,
      stateRate,
      presetRate,
      cityRate,
      nyc,
      ny,
      k401,
      age50,
      hsa,
      other,
    ],
  );

  const c = fmt.currency0;
  const minus = (n: number) => (n > 0 ? `−${c(n)}` : c(0));
  const has = r.gross > 0;
  const limit = age50 ? K401_LIMIT_50_PLUS : K401_LIMIT;

  return (
    <section className="card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <SectionLabel icon="coins">{P.heading}</SectionLabel>
        <span className="text-muted flex items-center gap-2 text-xs">
          {has && !open ? P.collapsed(c(r.monthly)) : null}
          <span aria-hidden>{open ? '−' : '+'}</span>
        </span>
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-5">
          {/* ---- inputs ---- */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={P.salary} value={salary} onChange={setSalary} placeholder="200,000" />
            <Field label={P.bonus} value={bonus} onChange={setBonus} />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-muted text-xs">{P.filing}</span>
            <div className="bg-surface-2 flex overflow-hidden rounded-[10px]">
              {(['single', 'mfj', 'hoh'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filing === f}
                  onClick={() => setFiling(f)}
                  className={`min-h-9 flex-1 px-2 text-xs font-medium transition-colors ${
                    filing === f
                      ? 'bg-foreground text-background'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  {P.filings[f]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-muted text-xs">{P.state}</span>
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setStateRate(null);
                }}
                className="field h-10 min-h-0 text-[15px]"
              >
                {STATE_TAXES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {ny ? (
              <label className="text-muted flex items-center gap-2 self-end pb-2.5 text-[13px]">
                <input type="checkbox" checked={nyc} onChange={(e) => setNyc(e.target.checked)} />
                {P.nycResident}
              </label>
            ) : exactState ? (
              <Field label={P.city} value={cityRate} onChange={setCityRate} prefix="" suffix="%" />
            ) : (
              <Field
                label={P.stateRate}
                value={stateRate ?? String(presetRate)}
                onChange={setStateRate}
                prefix=""
                suffix="%"
              />
            )}
          </div>
          {!exactState || (ny && !nyc) ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={P.city} value={cityRate} onChange={setCityRate} prefix="" suffix="%" />
              <p className="text-muted self-end text-[11px]">{P.cityHint}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Field label={P.k401} value={k401} onChange={setK401} />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-0"
                  onClick={() => setK401(String(limit))}
                >
                  {P.maxOut(c(limit))}
                </button>
                <label className="text-muted flex shrink-0 items-center gap-1.5 text-[11px] whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={age50}
                    onChange={(e) => setAge50(e.target.checked)}
                  />
                  {P.age50}
                </label>
              </div>
            </div>
            <Field label={P.hsa} value={hsa} onChange={setHsa} />
          </div>
          <Field label={P.otherPretax} value={other} onChange={setOther} />

          {/* ---- the sheet ---- */}
          {has ? (
            <>
              <div>
                <p className="eyebrow mb-1">{P.sectionIncome}</p>
                <ul className="rows">
                  <Row label={P.salary} value={c(money(salary))} />
                  {money(bonus) > 0 ? <Row label={P.bonus} value={c(money(bonus))} /> : null}
                  <Row label={P.grossTotal} value={c(r.gross)} strong />
                </ul>
              </div>

              {r.k401 + r.hsa + r.otherPretax > 0 ? (
                <div>
                  <p className="eyebrow mb-1">{P.sectionPretax}</p>
                  <ul className="rows">
                    {r.k401 > 0 ? (
                      <Row
                        label={P.k401}
                        value={minus(r.k401)}
                        note={r.k401Capped ? P.capped(c(limit)) : undefined}
                      />
                    ) : null}
                    {r.hsa > 0 ? <Row label={P.hsa} value={minus(r.hsa)} /> : null}
                    {r.otherPretax > 0 ? (
                      <Row label={P.otherPretax} value={minus(r.otherPretax)} />
                    ) : null}
                  </ul>
                </div>
              ) : null}

              <div>
                <p className="eyebrow mb-1">{P.sectionTax}</p>
                <ul className="rows">
                  <Row
                    label={P.federal}
                    note={P.marginal(fmt.pct0(r.federalMarginalPct))}
                    value={minus(r.federal)}
                  />
                  <Row label={P.socialSecurity} value={minus(r.socialSecurity)} />
                  <Row label={P.medicare} value={minus(r.medicare)} />
                  <Row
                    label={P.stateTax}
                    note={
                      state === 'CA'
                        ? P.caNote(CA_TAX_YEAR)
                        : ny
                          ? P.nyNote
                          : noTax
                            ? P.noStateTax
                            : P.estimated
                    }
                    value={minus(r.state)}
                  />
                  {r.sdi > 0 ? <Row label={ny ? P.nySdi : P.sdi} value={minus(r.sdi)} /> : null}
                  {r.pfl > 0 ? <Row label={P.pfl} value={minus(r.pfl)} /> : null}
                  {r.city > 0 ? (
                    <Row
                      label={P.cityTax}
                      note={r.cityExact ? P.nycNote : P.estimated}
                      value={minus(r.city)}
                    />
                  ) : null}
                  <Row
                    label={P.totalTax}
                    note={P.effective(fmt.pct0(r.effectiveTaxPct))}
                    value={minus(r.totalTax)}
                    strong
                  />
                </ul>
              </div>

              {/* The answer — the figures that matter, set large. */}
              <div className="bg-surface-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] p-4">
                <Big label={P.monthly} value={c(r.monthly)} />
                <Big label={P.annual} value={c(r.takeHome)} />
                <Small label={P.biweekly} value={c(r.biweekly)} />
                <Small label={P.semimonthly} value={c(r.semimonthly)} />
                {money(bonus) > 0 ? (
                  <div className="col-span-2">
                    <Small
                      label={P.bonusNet}
                      value={c(r.bonusTakeHome)}
                      note={P.bonusNote(c(r.bonusTax))}
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onApplyRate(Math.round(r.effectiveTaxPct * 10) / 10)}
                >
                  {P.applyRate(fmt.pct0(r.effectiveTaxPct))}
                </button>
                <span className="text-muted text-[11px]">{P.applyHint}</span>
              </div>
            </>
          ) : (
            <p className="text-muted text-[13px]">{P.empty}</p>
          )}

          <p className="text-muted text-[11px] leading-relaxed">
            {P.footnote(TAX_YEAR, CA_TAX_YEAR)}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Row({
  label,
  value,
  note,
  strong = false,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <li className="row items-center">
      <span className={`text-[13px] ${strong ? 'font-medium' : ''}`}>
        {label}
        {note ? <span className="text-muted block text-[11px]">{note}</span> : null}
      </span>
      <span
        className={`nums shrink-0 text-[13px] whitespace-nowrap ${strong ? 'font-semibold' : ''}`}
      >
        {value}
      </span>
    </li>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-xs">{label}</p>
      <p className="figure mt-0.5 text-[26px]">{value}</p>
    </div>
  );
}

function Small({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-muted text-xs">{label}</p>
      <p className="nums text-[15px] font-medium">{value}</p>
      {note ? <p className="text-muted text-[11px]">{note}</p> : null}
    </div>
  );
}
