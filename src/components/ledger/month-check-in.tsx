'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import {
  CATEGORY_IDS,
  isAfter,
  planAt,
  prefersDetail,
  recentAverage,
  shiftMonth,
  streak,
  type Categories,
  type CategoryId,
  type MonthEntry,
  type YearMonth,
} from '@/lib/ledger/ledger';
import type { YearRow } from '@/lib/simulator/engine';

import { SectionLabel } from '../ui/icon';

/**
 * The monthly check-in — the app's home screen. One month at a time, three
 * numbers, and an immediate answer ("you kept $X; your plan expected $Y").
 * The 12-column grid still exists for bulk edits, but nobody should have to
 * face 36 empty cells to log one month.
 */

/** What people actually type: "12,500", "$12500.50". Anything else → null. */
function parseMoney(raw: string, allowNegative = false): number | null {
  const cleaned = raw.replace(/[$¥,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) return null;
  if (n < 0 && !allowNegative) return null;
  return n;
}

function MoneyField({
  label,
  hint,
  value,
  placeholder,
  invalid,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium">{label}</span>
      <span className="relative">
        <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px]">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          className={`field field-money nums h-12 w-full text-[17px] ${invalid ? 'text-negative' : ''}`}
        />
      </span>
      <span className="text-muted text-[11px]">{hint}</span>
    </label>
  );
}

function Form({
  ym,
  entry,
  entries,
  planRows,
  startingNetWorth,
  monthLabel,
  justSaved,
  nextUp,
  onSelect,
  onSave,
  onClear,
  onDirty,
}: {
  ym: YearMonth;
  entry: MonthEntry | undefined;
  entries: MonthEntry[];
  planRows: YearRow[];
  startingNetWorth: number;
  monthLabel: (ym: YearMonth, style: 'long' | 'short') => string;
  /** Owned by the parent: saving a new month re-keys (remounts) this form. */
  justSaved: boolean;
  /** The following month, when it can be logged and hasn't been. */
  nextUp: YearMonth | null;
  onSelect: (ym: YearMonth) => void;
  onSave: (e: MonthEntry) => void;
  onClear: (ym: YearMonth) => void;
  onDirty: () => void;
}) {
  const { t, fmt, locale } = useI18n();
  const C = t.track.checkIn;
  // Placeholders sit behind a fixed "$", so they need the bare number.
  const plain = (n: number) => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(n);
  const str = (n: number | undefined) => (n === undefined ? '' : String(n));
  const [income, setIncome] = useState(() => str(entry?.income));
  const [spending, setSpending] = useState(() => str(entry?.spending));
  const [netWorth, setNetWorth] = useState(() => str(entry?.netWorth));
  // Coarse or fine: one total, or a line per category that adds up to it. A
  // new month starts in whichever way the previous one was logged.
  const [detailed, setDetailed] = useState(() =>
    entry ? Boolean(entry.categories) : prefersDetail(entries, ym),
  );
  const [cats, setCats] = useState<Partial<Record<CategoryId, string>>>(() =>
    Object.fromEntries(CATEGORY_IDS.map((id) => [id, str(entry?.categories?.[id])])),
  );
  const [touched, setTouched] = useState(false);

  const usual = useMemo(() => recentAverage(entries, ym), [entries, ym]);
  const plan = useMemo(
    () => planAt(planRows, startingNetWorth, ym),
    [planRows, startingNetWorth, ym],
  );
  const prev = entries.find((e) => {
    const p = shiftMonth(ym, -1);
    return e.year === p.year && e.month === p.month;
  });

  const inc = income.trim() === '' ? undefined : parseMoney(income);
  // Per-category parse: number, undefined (blank) or null (unreadable).
  const catValues = CATEGORY_IDS.map((id) => {
    const raw = cats[id] ?? '';
    return { id, value: raw.trim() === '' ? undefined : parseMoney(raw) };
  });
  const catFilled = catValues.filter((c) => typeof c.value === 'number');
  const catTotal = Math.round(catFilled.reduce((t, c) => t + (c.value as number), 0) * 100) / 100;
  const sp = detailed
    ? catValues.some((c) => c.value === null)
      ? null
      : catFilled.length
        ? catTotal
        : undefined
    : spending.trim() === ''
      ? undefined
      : parseMoney(spending);
  const nw = netWorth.trim() === '' ? undefined : parseMoney(netWorth, true);
  const anyInvalid = inc === null || sp === null || nw === null;
  const canSave = !anyInvalid && (inc !== undefined || sp !== undefined || nw !== undefined);
  const dirty = touched;

  const edit = (set: (s: string) => void) => (next: string) => {
    set(next);
    setTouched(true);
    onDirty();
  };
  const editCat = (id: CategoryId, next: string) => {
    setCats((c) => ({ ...c, [id]: next }));
    setTouched(true);
    onDirty();
  };

  function switchMode(next: boolean) {
    if (next === detailed) return;
    if (next) {
      // Keep a typed total: park it under "other" until it's split up.
      if (catFilled.length === 0 && typeof sp === 'number' && sp > 0) {
        setCats((c) => ({ ...c, other: String(sp) }));
      }
    } else if (catTotal > 0) setSpending(String(catTotal));
    setDetailed(next);
    setTouched(true);
    onDirty();
  }

  /** Last month's bills are this month's first guess — only blanks are filled. */
  function fillFromLast() {
    if (!prev?.categories) return;
    setCats((c) => {
      const out = { ...c };
      for (const id of CATEGORY_IDS) {
        const v = prev.categories?.[id];
        if ((out[id] ?? '').trim() === '' && v !== undefined) out[id] = String(v);
      }
      return out;
    });
    setTouched(true);
    onDirty();
  }

  const kept = typeof inc === 'number' && typeof sp === 'number' ? inc - sp : null;
  const rate = kept !== null && typeof inc === 'number' && inc > 0 ? (kept / inc) * 100 : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        const categories: Categories = {};
        if (detailed) for (const c of catFilled) categories[c.id] = c.value as number;
        onSave({
          year: ym.year,
          month: ym.month,
          income: inc ?? 0,
          spending: sp ?? 0,
          ...(typeof nw === 'number' ? { netWorth: nw } : {}),
          ...(detailed && catFilled.length ? { categories } : {}),
        });
        setTouched(false);
      }}
    >
      {/* How much detail: one number, or a line per category. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted text-xs">{C.modeLabel}</span>
        <div
          role="group"
          aria-label={C.modeLabel}
          className="bg-surface-2 flex overflow-hidden rounded-[10px] text-xs"
        >
          {([false, true] as const).map((d) => (
            <button
              key={String(d)}
              type="button"
              aria-pressed={detailed === d}
              onClick={() => switchMode(d)}
              className={`min-h-8 px-3 font-medium transition-colors ${
                detailed === d
                  ? 'bg-foreground text-background'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {d ? C.modeDetailed : C.modeSimple}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${detailed ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        <div className="flex flex-col gap-1.5">
          <MoneyField
            label={C.income}
            hint={C.incomeHint}
            value={income}
            placeholder={usual ? C.usually(plain(usual.income)) : '0'}
            invalid={inc === null}
            onChange={edit(setIncome)}
          />
          {prev && prev.income > 0 && income.trim() === '' ? (
            <button
              type="button"
              className="btn btn-ghost h-7 min-h-0 self-start px-2 text-[11px]"
              onClick={() => edit(setIncome)(String(prev.income))}
            >
              {C.sameAsLast(monthLabel(shiftMonth(ym, -1), 'short'), fmt.currency0(prev.income))}
            </button>
          ) : null}
        </div>
        {detailed ? null : (
          <MoneyField
            label={C.spending}
            hint={C.spendingHint}
            value={spending}
            placeholder={usual ? C.usually(plain(usual.spending)) : '0'}
            invalid={sp === null}
            onChange={edit(setSpending)}
          />
        )}
        <MoneyField
          label={C.netWorth}
          hint={C.netWorthHint}
          value={netWorth}
          placeholder={C.optional}
          invalid={nw === null}
          onChange={edit(setNetWorth)}
        />
      </div>

      {detailed ? (
        <fieldset className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <legend className="text-[13px] font-medium">{C.spending}</legend>
            {prev?.categories ? (
              <button
                type="button"
                className="btn btn-ghost h-7 min-h-0 px-2 text-[11px]"
                onClick={fillFromLast}
              >
                {C.fillFromLast(monthLabel(shiftMonth(ym, -1), 'short'))}
              </button>
            ) : null}
          </div>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {catValues.map(({ id, value }) => (
              <li key={id}>
                <label className="grid grid-cols-[1fr_8.5rem] items-center gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px]">{t.track.categories[id]}</span>
                    {id === 'housing' && plan && plan.monthlyHousing > 0 ? (
                      <span className="text-muted block truncate text-[11px]">
                        {C.housingPlan(fmt.currency0(plan.monthlyHousing))}
                      </span>
                    ) : null}
                  </span>
                  <span className="relative">
                    <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px]">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={cats[id] ?? ''}
                      placeholder={
                        prev?.categories?.[id] !== undefined ? plain(prev.categories[id]!) : '0'
                      }
                      aria-invalid={value === null}
                      onChange={(e) => editCat(id, e.target.value)}
                      className={`field field-money nums h-10 min-h-0 w-full text-right text-[15px] ${
                        value === null ? 'text-negative' : ''
                      }`}
                    />
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="rule" />
          <p className="flex items-center justify-between text-[13px]">
            <span className="text-muted">{C.total}</span>
            <span className="nums font-medium">{fmt.currency0(catTotal)}</span>
          </p>
        </fieldset>
      ) : null}

      {/* The answer, as they type. */}
      {kept !== null ? (
        <div className="bg-surface-2 rounded-[12px] px-4 py-3">
          <p className="text-[15px]">
            {kept >= 0 ? C.kept(fmt.currency0(kept)) : C.overspent(fmt.currency0(-kept))}
            {rate !== null && kept >= 0 ? (
              <span className="text-muted"> · {C.rate(fmt.pct0(rate))}</span>
            ) : null}
          </p>
          {plan ? (
            <p className="text-muted mt-0.5 text-[13px]">
              {C.planExpects(fmt.currency0(plan.monthlySaved))}{' '}
              <span className={kept >= plan.monthlySaved ? 'text-positive' : 'text-negative'}>
                {kept >= plan.monthlySaved
                  ? C.ahead(fmt.currency0(kept - plan.monthlySaved))
                  : C.behind(fmt.currency0(plan.monthlySaved - kept))}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
      {anyInvalid ? <p className="text-negative text-xs">{C.invalid}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="btn btn-primary min-w-32 flex-1 sm:flex-none"
          disabled={!canSave || (!dirty && !!entry)}
        >
          {entry ? C.update : C.save(monthLabel(ym, 'long'))}
        </button>
        {entry ? (
          <button type="button" className="btn btn-ghost" onClick={() => onClear(ym)}>
            {C.clear}
          </button>
        ) : null}
        {justSaved ? <span className="text-positive toast-in text-[13px]">✓ {C.saved}</span> : null}
        {justSaved && nextUp ? (
          <button type="button" className="btn btn-ghost ml-auto" onClick={() => onSelect(nextUp)}>
            {C.next(monthLabel(nextUp, 'long'))} ›
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function MonthCheckIn({
  entries,
  sel,
  today,
  planRows,
  startingNetWorth,
  onSelect,
  onSave,
  onClear,
}: {
  entries: MonthEntry[];
  sel: YearMonth;
  today: YearMonth;
  planRows: YearRow[];
  startingNetWorth: number;
  onSelect: (ym: YearMonth) => void;
  onSave: (e: MonthEntry) => void;
  onClear: (ym: YearMonth) => void;
}) {
  const { t, locale } = useI18n();
  const C = t.track.checkIn;

  const monthLabel = useMemo(() => {
    const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
    const long = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' });
    const short = new Intl.DateTimeFormat(tag, { month: 'short' });
    return (ym: YearMonth, style: 'long' | 'short') =>
      (style === 'long' ? long : short).format(new Date(ym.year, ym.month - 1, 1));
  }, [locale]);

  const entry = entries.find((e) => e.year === sel.year && e.month === sel.month);
  const logged = new Set(entries.filter((e) => e.year === sel.year).map((e) => e.month));
  const run = streak(entries, today);
  const atLatest = !isAfter(today, sel);
  // Which month was just saved — cleared by the next edit or month change.
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const selKey = `${sel.year}-${sel.month}`;
  const following = shiftMonth(sel, 1);
  const nextUp =
    !isAfter(following, today) &&
    !entries.some((e) => e.year === following.year && e.month === following.month)
      ? following
      : null;

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon="coins">{C.eyebrow}</SectionLabel>
        {run >= 2 ? <span className="text-accent nums text-xs">{C.streak(run)}</span> : null}
      </div>

      <div className="mt-2 mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="display text-[26px] leading-tight">{monthLabel(sel, 'long')}</h2>
          <p className={`text-[13px] ${entry ? 'text-positive' : 'text-muted'}`}>
            {entry ? `✓ ${C.logged}` : C.notLogged}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost px-3"
            aria-label={C.prevMonth}
            onClick={() => onSelect(shiftMonth(sel, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn-ghost px-3"
            aria-label={C.nextMonth}
            disabled={atLatest}
            onClick={() => onSelect(shiftMonth(sel, 1))}
          >
            ›
          </button>
        </div>
      </div>

      {/* Keyed by month so the drafts reset when the month changes. */}
      <Form
        key={`${selKey}-${entry ? 'e' : 'n'}`}
        ym={sel}
        entry={entry}
        entries={entries}
        planRows={planRows}
        startingNetWorth={startingNetWorth}
        monthLabel={monthLabel}
        justSaved={savedKey === selKey}
        nextUp={nextUp}
        onSelect={onSelect}
        onSave={(e) => {
          onSave(e);
          setSavedKey(selKey);
        }}
        onClear={(ym) => {
          onClear(ym);
          setSavedKey(null);
        }}
        onDirty={() => setSavedKey(null)}
      />

      {/* The year at a glance — tap a month to jump to it. */}
      <hr className="rule my-4" />
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">{sel.year}</span>
        <span className="text-muted text-[11px]">{C.monthsLogged(logged.size)}</span>
      </div>
      <ol className="mt-2 grid grid-cols-12 gap-1">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => {
          const ym = { year: sel.year, month: mo };
          const future = isAfter(ym, today);
          const isSel = mo === sel.month;
          return (
            <li key={mo}>
              <button
                type="button"
                disabled={future}
                aria-label={monthLabel(ym, 'long')}
                aria-current={isSel ? 'true' : undefined}
                onClick={() => onSelect(ym)}
                className={`flex w-full flex-col items-center gap-1 rounded-[8px] py-1.5 text-[10px] transition-colors ${
                  isSel ? 'bg-surface-2 text-foreground' : 'text-muted hover:text-foreground'
                } ${future ? 'opacity-30' : ''}`}
              >
                <span
                  className={`block h-2 w-2 rounded-[2px] ${
                    logged.has(mo) ? 'bg-positive' : 'bg-foreground/15'
                  }`}
                />
                {mo}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
