'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import {
  CATEGORY_IDS,
  INCOME_SOURCE_IDS,
  isAfter,
  planAt,
  prefersDetail,
  recentAverage,
  recurringFor,
  shiftMonth,
  streak,
  subsOf,
  TIER_IDS,
  tierOf,
  tierTotals,
  type Breakdown,
  type Categories,
  type CategoryId,
  type IncomeSourceId,
  type IncomeSources,
  type MonthEntry,
  type Recurring,
  type TierId,
  type SubId,
  type YearMonth,
} from '@/lib/ledger/ledger';
import type { YearRow } from '@/lib/simulator/engine';

import { dueItems, type AnnualExpense } from '@/lib/ledger/annual';
import type { Budgets } from '@/lib/ledger/budgets';

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

/** One color per kind of spending, used as a dot and in the bar. */
export const TIER_DOT: Record<TierId, string> = {
  needs: 'bg-foreground/60',
  lifestyle: 'bg-accent',
  splurge: 'bg-negative',
};

/** Essentials / lifestyle / splurges as one stacked bar with amounts. */
export function TierBar({
  tiers,
  total,
}: {
  tiers: Record<TierId, number> & { unsorted: number };
  total: number;
}) {
  const { t, fmt } = useI18n();
  const T = t.track.tiers;
  return (
    <div className="mt-1 flex flex-col gap-2">
      <span className="bg-surface-2 flex h-2 overflow-hidden rounded-full">
        {TIER_IDS.map((k) =>
          tiers[k] > 0 ? (
            <span
              key={k}
              className={`h-full ${TIER_DOT[k]}`}
              style={{ width: `${(tiers[k] / total) * 100}%` }}
            />
          ) : null,
        )}
      </span>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-3">
        {TIER_IDS.map((k) => (
          <li
            key={k}
            className="flex items-baseline justify-between gap-2 text-xs sm:flex-col sm:items-start sm:gap-0"
          >
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${TIER_DOT[k]}`} />
              {T[k]}
            </span>
            <span className="nums text-muted">
              {fmt.currency0(tiers[k])} · {fmt.pct0(total > 0 ? (tiers[k] / total) * 100 : 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A small mark on an amount that came over from last month unchanged. */
function FixedTag() {
  const { t } = useI18n();
  return (
    <span className="text-accent shrink-0 text-[10px] font-medium">{t.track.checkIn.fixedTag}</span>
  );
}

/** "Budget $800 · $150 left" — or, past it, "$120 over" in red. */
function BudgetHint({ budget, spent }: { budget: number; spent: number }) {
  const { t, fmt } = useI18n();
  const C = t.track.checkIn;
  const left = budget - spent;
  return (
    <span className={`block truncate text-[11px] ${left < 0 ? 'text-negative' : 'text-muted'}`}>
      {left < 0
        ? C.budgetOver(fmt.currency0(budget), fmt.currency0(-left))
        : C.budgetLeft(fmt.currency0(budget), fmt.currency0(left))}
    </span>
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
  budgets,
  annual,
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
  /** Monthly budget per category, from the plan. */
  budgets: Budgets;
  /** Once-a-year bills, from the plan. */
  annual: AnnualExpense[];
}) {
  const { t, fmt, locale } = useI18n();
  const C = t.track.checkIn;
  // Placeholders sit behind a fixed "$", so they need the bare number.
  const plain = (n: number) => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(n);
  const str = (n: number | undefined) => (n === undefined ? '' : String(n));
  const [income, setIncome] = useState(() => str(entry?.income));
  const [spending, setSpending] = useState(() => str(entry?.spending));
  const [netWorth, setNetWorth] = useState(() => str(entry?.netWorth));
  // A NEW month starts with what repeats — rent, insurance, salary, 401(k):
  // amounts identical in the last two months are filled in and tagged.
  const [carried, setCarried] = useState<Recurring | null>(() => {
    if (entry) return null;
    const r = recurringFor(entries, ym);
    return r.count > 0 ? r : null;
  });
  // Coarse or fine: one total, or a line per category that adds up to it. A
  // new month starts in whichever way the previous one was logged.
  const [detailed, setDetailed] = useState(() =>
    entry ? Boolean(entry.categories) : prefersDetail(entries, ym),
  );
  const [cats, setCats] = useState<Partial<Record<CategoryId, string>>>(() =>
    Object.fromEntries(
      CATEGORY_IDS.map((id) => [id, str(entry?.categories?.[id] ?? carried?.categories[id])]),
    ),
  );
  // The finest level: line items inside a category (housing → mortgage, tax,
  // HOA…). A category with items filled in shows their sum and can't be typed.
  const [subs, setSubs] = useState<Partial<Record<SubId, string>>>(() =>
    Object.fromEntries(
      Object.entries(entry?.breakdown ?? carried?.lineItems ?? {}).map(([id, v]) => [id, str(v)]),
    ),
  );
  const [open, setOpen] = useState<CategoryId[]>(() => {
    const from =
      entry ?? entries.filter((e) => e.year * 12 + e.month < ym.year * 12 + ym.month).at(-1);
    return CATEGORY_IDS.filter((c) => subsOf(c).some((id) => from?.breakdown?.[id] !== undefined));
  });
  // Income side, the budget-sheet way: one number, or split by source; plus
  // what left the paycheck before take-home (401(k), HSA).
  const lastLogged =
    entry ?? entries.filter((e) => e.year * 12 + e.month < ym.year * 12 + ym.month).at(-1);
  const [bySource, setBySource] = useState(() => Boolean(lastLogged?.incomeSources));
  const [srcs, setSrcs] = useState<Partial<Record<IncomeSourceId, string>>>(() =>
    Object.fromEntries(
      Object.entries(entry?.incomeSources ?? carried?.incomeSources ?? {}).map(([id, v]) => [
        id,
        str(v),
      ]),
    ),
  );
  const [pretax, setPretax] = useState(() => str(entry?.pretaxSavings ?? carried?.pretaxSavings));

  /** Take back what was carried over (anything the person changed stays). */
  function clearCarried() {
    if (!carried) return;
    const untouched = (now: string | undefined, was: number | undefined) =>
      was !== undefined && (now ?? '') === str(was);
    setSubs((c) => {
      const out = { ...c };
      for (const [id, v] of Object.entries(carried.lineItems) as Array<[SubId, number]>)
        if (untouched(out[id], v)) out[id] = '';
      return out;
    });
    setCats((c) => {
      const out = { ...c };
      for (const [id, v] of Object.entries(carried.categories) as Array<[CategoryId, number]>)
        if (untouched(out[id], v)) out[id] = '';
      return out;
    });
    setSrcs((c) => {
      const out = { ...c };
      for (const [id, v] of Object.entries(carried.incomeSources) as Array<
        [IncomeSourceId, number]
      >)
        if (untouched(out[id], v)) out[id] = '';
      return out;
    });
    if (untouched(pretax, carried.pretaxSavings)) setPretax('');
    setCarried(null);
  }
  /** True for a field whose value came over unchanged from last month. */
  const isCarried = (now: string | undefined, was: number | undefined) =>
    carried !== null && was !== undefined && (now ?? '') === str(was);
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

  // Per-field parse: number, undefined (blank) or null (unreadable).
  const blank = (raw: string | undefined) => (raw ?? '').trim() === '';
  const srcValues = INCOME_SOURCE_IDS.map((id) => ({
    id,
    value: blank(srcs[id]) ? undefined : parseMoney(srcs[id]!),
  }));
  const srcFilled = srcValues.filter((v) => typeof v.value === 'number');
  const srcSum = Math.round(srcFilled.reduce((t, v) => t + (v.value as number), 0) * 100) / 100;
  const inc = bySource
    ? srcValues.some((v) => v.value === null)
      ? null
      : srcFilled.length
        ? srcSum
        : undefined
    : income.trim() === ''
      ? undefined
      : parseMoney(income);
  const pt = blank(pretax) ? undefined : parseMoney(pretax);
  const catValues = CATEGORY_IDS.map((id) => {
    const items = subsOf(id).map((sub) => ({
      id: sub,
      value: blank(subs[sub]) ? undefined : parseMoney(subs[sub]!),
    }));
    const filled = items.filter((i) => typeof i.value === 'number');
    // With line items, the category IS their sum; otherwise it's what was typed.
    const itemized = filled.length > 0;
    const sum = Math.round(filled.reduce((t, i) => t + (i.value as number), 0) * 100) / 100;
    const value = items.some((i) => i.value === null)
      ? null
      : itemized
        ? sum
        : blank(cats[id])
          ? undefined
          : parseMoney(cats[id]!);
    return { id, value, items, itemized };
  });
  const catFilled = catValues.filter((c) => typeof c.value === 'number');
  const catTotal = Math.round(catFilled.reduce((t, c) => t + (c.value as number), 0) * 100) / 100;
  // The same month, sorted by KIND of spending (essentials / lifestyle / splurges).
  const tiers = detailed
    ? tierTotals({
        year: ym.year,
        month: ym.month,
        income: 0,
        spending: catTotal,
        categories: Object.fromEntries(catFilled.map((c) => [c.id, c.value as number])),
        breakdown: Object.fromEntries(
          catValues.flatMap((c) =>
            c.items.filter((i) => typeof i.value === 'number').map((i) => [i.id, i.value]),
          ),
        ),
      })
    : null;
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
  const anyInvalid = inc === null || sp === null || nw === null || pt === null;
  const canSave =
    !anyInvalid && (inc !== undefined || sp !== undefined || nw !== undefined || pt !== undefined);
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
  const editSub = (id: SubId, next: string) => {
    setSubs((c) => ({ ...c, [id]: next }));
    setTouched(true);
    onDirty();
  };
  const editSrc = (id: IncomeSourceId, next: string) => {
    setSrcs((c) => ({ ...c, [id]: next }));
    setTouched(true);
    onDirty();
  };
  function toggleSources() {
    if (!bySource && srcFilled.length === 0 && typeof inc === 'number' && inc > 0) {
      // Keep a typed total: start it off as salary.
      setSrcs((c) => ({ ...c, salary: String(inc) }));
    } else if (bySource && srcSum > 0) setIncome(String(srcSum));
    setBySource((v) => !v);
    setTouched(true);
    onDirty();
  }
  const toggleOpen = (id: CategoryId) =>
    setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

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

  // Once-a-year bills due this month that haven't been entered yet.
  const annualPending = (
    Object.entries(dueItems(annual, ym.month)) as Array<[SubId, number]>
  ).filter(([id]) => blank(subs[id]));
  function fillAnnual() {
    if (!detailed) switchMode(true);
    setSubs((c) => {
      const out = { ...c };
      for (const [id, v] of annualPending) out[id] = String(v);
      return out;
    });
    setOpen((o) => [
      ...new Set([...o, ...annualPending.map(([id]) => id.split('.')[0] as CategoryId)]),
    ]);
    setTouched(true);
    onDirty();
  }

  /** Last month's bills are this month's first guess — only blanks are filled. */
  function fillFromLast() {
    if (!prev?.categories) return;
    const itemizedLast = (id: CategoryId) =>
      subsOf(id).some((sub) => prev.breakdown?.[sub] !== undefined);
    setSubs((c) => {
      const out = { ...c };
      for (const [sub, v] of Object.entries(prev.breakdown ?? {}) as Array<[SubId, number]>) {
        if (blank(out[sub])) out[sub] = String(v);
      }
      return out;
    });
    setCats((c) => {
      const out = { ...c };
      for (const id of CATEGORY_IDS) {
        const v = prev.categories?.[id];
        // A category that was itemized last month is filled through its items.
        if (blank(out[id]) && v !== undefined && !itemizedLast(id)) out[id] = String(v);
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
        const incomeSources: IncomeSources = {};
        if (bySource) for (const v of srcFilled) incomeSources[v.id] = v.value as number;
        const categories: Categories = {};
        const breakdown: Breakdown = {};
        if (detailed) {
          for (const c of catFilled) categories[c.id] = c.value as number;
          for (const c of catValues)
            for (const i of c.items) if (typeof i.value === 'number') breakdown[i.id] = i.value;
        }
        onSave({
          year: ym.year,
          month: ym.month,
          income: inc ?? 0,
          spending: sp ?? 0,
          ...(typeof nw === 'number' ? { netWorth: nw } : {}),
          ...(detailed && catFilled.length ? { categories } : {}),
          ...(detailed && Object.keys(breakdown).length ? { breakdown } : {}),
          ...(bySource && srcFilled.length ? { incomeSources } : {}),
          ...(typeof pt === 'number' ? { pretaxSavings: pt } : {}),
        });
        setTouched(false);
      }}
    >
      {carried ? (
        <div className="bg-surface-2 flex items-center justify-between gap-3 rounded-[10px] px-3 py-2">
          <span className="text-xs">{C.carried(carried.count)}</span>
          <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={clearCarried}>
            {C.clearCarried}
          </button>
        </div>
      ) : null}

      {annualPending.length ? (
        <div className="bg-surface-2 flex items-center justify-between gap-3 rounded-[10px] px-3 py-2">
          <span className="text-xs">
            {C.annualDue(
              annualPending
                .map(([id, v]) => `${t.track.subcategories[id]} ${fmt.currency0(v)}`)
                .join(locale === 'zh' ? '、' : ', '),
            )}
          </span>
          <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={fillAnnual}>
            {C.fillAnnual}
          </button>
        </div>
      ) : null}

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
          {bySource ? (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">{C.income}</span>
              <span
                title={C.sumOfSources}
                className="field field-money nums text-muted relative flex h-12 items-center text-[17px]"
              >
                <span className="absolute left-3 text-[15px]">$</span>
                {plain(srcSum)}
              </span>
              <span className="text-muted text-[11px]">{C.sumOfSources}</span>
            </div>
          ) : (
            <MoneyField
              label={C.income}
              hint={C.incomeHint}
              value={income}
              placeholder={usual ? C.usually(plain(usual.income)) : '0'}
              invalid={inc === null}
              onChange={edit(setIncome)}
            />
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm self-start px-0"
            aria-expanded={bySource}
            onClick={toggleSources}
          >
            {bySource ? C.bySourceHide : C.bySource} ›
          </button>
          {!bySource && prev && prev.income > 0 && income.trim() === '' ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm self-start"
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

      {bySource ? (
        <fieldset className="bg-surface-2/50 flex flex-col gap-2 rounded-[12px] p-3">
          <legend className="sr-only">{C.income}</legend>
          <p className="text-muted text-[11px]">{C.sourcesHint}</p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {srcValues.map(({ id, value }) => (
              <li key={id}>
                <label className="grid grid-cols-[1fr_8.5rem] items-center gap-3">
                  <span className="flex items-center gap-1.5 truncate text-[13px]">
                    {t.track.incomeSources[id]}
                    {isCarried(srcs[id], carried?.incomeSources[id]) ? <FixedTag /> : null}
                  </span>
                  <span className="relative">
                    <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px]">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={srcs[id] ?? ''}
                      placeholder={
                        prev?.incomeSources?.[id] !== undefined
                          ? plain(prev.incomeSources[id]!)
                          : '0'
                      }
                      aria-invalid={value === null}
                      onChange={(e) => editSrc(id, e.target.value)}
                      className={`field field-money nums h-10 min-h-0 w-full text-right text-[15px] ${
                        value === null ? 'text-negative' : ''
                      }`}
                    />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <label className="grid grid-cols-[1fr_8.5rem] items-center gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            {C.pretax}
            {isCarried(pretax, carried?.pretaxSavings) ? <FixedTag /> : null}
          </span>
          <span className="text-muted block text-[11px]">{C.pretaxHint}</span>
        </span>
        <span className="relative">
          <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px]">
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={pretax}
            placeholder={prev?.pretaxSavings !== undefined ? plain(prev.pretaxSavings) : C.optional}
            aria-invalid={pt === null}
            onChange={(e) => edit(setPretax)(e.target.value)}
            className={`field field-money nums h-10 min-h-0 w-full text-right text-[15px] ${
              pt === null ? 'text-negative' : ''
            }`}
          />
        </span>
      </label>

      {detailed ? (
        <fieldset className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <legend className="text-[13px] font-medium">{C.spending}</legend>
            {prev?.categories ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={fillFromLast}>
                {C.fillFromLast(monthLabel(shiftMonth(ym, -1), 'short'))}
              </button>
            ) : null}
          </div>
          <p className="text-muted text-[11px]">{C.breakdownHint}</p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {catValues.map(({ id, value, items, itemized }) => {
              const isOpen = open.includes(id);
              return (
                <li key={id} className={isOpen ? 'sm:col-span-2' : ''}>
                  <div className="grid grid-cols-[1fr_8.5rem] items-center gap-3">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggleOpen(id)}
                      className="hover:text-foreground flex min-w-0 items-center gap-2 text-left"
                    >
                      <span
                        aria-hidden
                        className={`text-muted inline-block w-3 shrink-0 text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      >
                        ›
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-[13px]">
                          {t.track.categories[id]}
                          {isCarried(cats[id], carried?.categories[id]) ? <FixedTag /> : null}
                        </span>
                        {budgets[id] ? (
                          <BudgetHint
                            budget={budgets[id]!}
                            spent={typeof value === 'number' ? value : 0}
                          />
                        ) : id === 'housing' && plan && plan.monthlyHousing > 0 ? (
                          <span className="text-muted block truncate text-[11px]">
                            {C.housingPlan(fmt.currency0(plan.monthlyHousing))}
                          </span>
                        ) : itemized && !isOpen ? (
                          <span className="text-muted block truncate text-[11px]">
                            {C.itemCount(items.filter((i) => typeof i.value === 'number').length)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <span className="relative">
                      <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px]">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={t.track.categories[id]}
                        value={itemized ? String(value ?? '') : (cats[id] ?? '')}
                        readOnly={itemized}
                        title={itemized ? C.sumOfItems : undefined}
                        placeholder={
                          prev?.categories?.[id] !== undefined ? plain(prev.categories[id]!) : '0'
                        }
                        aria-invalid={value === null}
                        onChange={(e) => editCat(id, e.target.value)}
                        className={`field field-money nums h-10 min-h-0 w-full text-right text-[15px] ${
                          value === null ? 'text-negative' : ''
                        } ${itemized ? 'opacity-70' : ''}`}
                      />
                    </span>
                  </div>

                  {isOpen ? (
                    <ul className="bg-surface-2/50 mt-2 grid grid-cols-1 gap-x-4 gap-y-2 rounded-[12px] p-3 sm:grid-cols-2">
                      {items.map((item) => (
                        <li key={item.id}>
                          <label className="grid grid-cols-[1fr_7.5rem] items-center gap-3">
                            <span className="text-muted flex min-w-0 items-center gap-2 text-[13px]">
                              <span
                                aria-hidden
                                title={t.track.tiers[tierOf(item.id)]}
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIER_DOT[tierOf(item.id)]}`}
                              />
                              <span className="truncate">{t.track.subcategories[item.id]}</span>
                              {isCarried(subs[item.id], carried?.lineItems[item.id]) ? (
                                <FixedTag />
                              ) : null}
                            </span>
                            <span className="relative">
                              <span className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
                                $
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={subs[item.id] ?? ''}
                                placeholder={
                                  prev?.breakdown?.[item.id] !== undefined
                                    ? plain(prev.breakdown[item.id]!)
                                    : '0'
                                }
                                aria-invalid={item.value === null}
                                onChange={(e) => editSub(item.id, e.target.value)}
                                className={`field field-money nums h-9 min-h-0 w-full text-right text-sm ${
                                  item.value === null ? 'text-negative' : ''
                                }`}
                              />
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="rule" />
          <p className="flex items-center justify-between text-[13px]">
            <span className="text-muted">{C.total}</span>
            <span className="nums font-medium">{fmt.currency0(catTotal)}</span>
          </p>
          {tiers && catTotal > 0 ? <TierBar tiers={tiers} total={catTotal} /> : null}
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
          {typeof pt === 'number' && pt > 0 ? (
            <p className="text-positive mt-0.5 text-[13px]">
              {C.keptPlusPretax(fmt.currency0(pt), fmt.currency0(kept + pt))}
            </p>
          ) : null}
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
  budgets,
  annual,
}: {
  entries: MonthEntry[];
  sel: YearMonth;
  today: YearMonth;
  planRows: YearRow[];
  startingNetWorth: number;
  onSelect: (ym: YearMonth) => void;
  onSave: (e: MonthEntry) => void;
  onClear: (ym: YearMonth) => void;
  budgets: Budgets;
  annual: AnnualExpense[];
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

      {/* Keyed by month so the drafts reset when the month changes — and once
          when the saved ledger arrives (it loads just after first paint), so a
          new month starts from the real history: mode, repeats, placeholders. */}
      <Form
        key={`${selKey}-${entry ? 'e' : 'n'}-${entries.length > 0 ? 'data' : 'empty'}`}
        ym={sel}
        entry={entry}
        entries={entries}
        planRows={planRows}
        startingNetWorth={startingNetWorth}
        monthLabel={monthLabel}
        budgets={budgets}
        annual={annual}
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
