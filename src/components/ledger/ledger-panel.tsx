'use client';

import { useMemo, useRef, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import {
  calibrationPatch,
  categoryBreakdown,
  checkInTarget,
  isAfter,
  parseLedgerCsv,
  remove,
  templateCsv,
  toCsv,
  upsert,
  yearReport,
  type MonthEntry,
  type YearMonth,
} from '@/lib/ledger/ledger';
import type { YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

import Icon, { SectionLabel } from '../ui/icon';
import MonthCheckIn from './month-check-in';
import TrackStatus from './track-status';

/**
 * Track — the app's home: monthly check-in, "am I on track?", year report.
 *
 * Three numbers a month, typed into the check-in or filled into the CSV
 * template in Excel and imported (the full-year grid sits behind a
 * disclosure for bulk edits). The report compares the year against the
 * projection and can push the real numbers back into the plan. Nothing
 * leaves the device: import is a local file read, export is a Blob download.
 */

type Field = 'income' | 'spending' | 'netWorth';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Compact money cell with a string buffer, so it can be cleared. */
function Cell({
  value,
  label,
  allowNegative = false,
  lockedHint,
  onCommit,
}: {
  value: number | undefined;
  label: string;
  allowNegative?: boolean;
  /** Set when the value is derived (a category total) and can't be typed over. */
  lockedHint?: string;
  onCommit: (n: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined || value === 0 ? '' : String(value));
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      readOnly={lockedHint !== undefined}
      title={lockedHint}
      placeholder="—"
      value={shown}
      min={allowNegative ? undefined : 0}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next.trim() === '') return;
        const n = Number(next);
        if (Number.isFinite(n) && Math.abs(n) <= 1e12 && (allowNegative || n >= 0)) onCommit(n);
      }}
      onBlur={() => {
        if (draft !== null && draft.trim() === '') onCommit(null);
        setDraft(null);
      }}
      className="field nums h-9 min-h-0 px-2 text-right text-[13px]"
    />
  );
}

export default function LedgerPanel({
  entries,
  onChange,
  assumptions,
  planRows,
  fire,
  onOpenPlan,
  onCalibrate,
}: {
  entries: MonthEntry[];
  onChange: (next: MonthEntry[]) => void;
  assumptions: Assumptions;
  planRows: YearRow[];
  fire: { age: number; year: number } | null;
  onOpenPlan: () => void;
  onCalibrate: (patch: Partial<Assumptions>) => void;
}) {
  const { t, fmt, locale } = useI18n();
  const L = t.ledger;
  const [today] = useState<YearMonth>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  // Until the user picks a month, follow the check-in target — it moves on
  // by itself once the saved ledger has loaded or last month gets logged.
  const [picked, setPicked] = useState<YearMonth | null>(null);
  const sel = picked ?? checkInTarget(entries, today);
  const year = sel.year;
  const select = (ym: YearMonth) => setPicked(isAfter(ym, today) ? today : ym);
  const setYear = (y: number) => select({ year: y, month: sel.month });
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const monthName = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' });
    return (m: number) => f.format(new Date(2000, m - 1, 1));
  }, [locale]);

  const report = useMemo(() => yearReport(entries, year, planRows), [entries, year, planRows]);
  const breakdown = useMemo(() => categoryBreakdown(entries, year), [entries, year]);
  const patch = useMemo(
    () => calibrationPatch(report, entries, assumptions),
    [report, entries, assumptions],
  );

  function edit(month: number, field: Field, n: number | null) {
    const cur = entries.find((e) => e.year === year && e.month === month) ?? {
      year,
      month,
      income: 0,
      spending: 0,
    };
    const next: MonthEntry = { ...cur };
    if (field === 'netWorth') {
      if (n === null) delete next.netWorth;
      else next.netWorth = n;
    } else next[field] = n ?? 0;
    const empty = next.income === 0 && next.spending === 0 && next.netWorth === undefined;
    onChange(empty ? remove(entries, year, month) : upsert(entries, next));
  }

  async function importFile(file: File) {
    // Size-check BEFORE reading; the parser caps it again.
    if (file.size > 200_000) return setNote({ tone: 'bad', text: L.fatal.tooLarge });
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setNote({ tone: 'bad', text: L.fatal.unreadable });
    }
    const res = parseLedgerCsv(text);
    if (res.fatal) return setNote({ tone: 'bad', text: L.fatal[res.fatal] });
    let merged = entries;
    for (const e of res.entries) merged = upsert(merged, e);
    onChange(merged.slice(-600));
    const lastImported = res.entries.at(-1);
    if (lastImported) select(lastImported);
    const skipped = res.errors.map((e) => e.line);
    setNote({
      tone: skipped.length ? 'bad' : 'ok',
      text:
        L.imported(res.entries.length) +
        (skipped.length ? ' ' + L.skipped(skipped.slice(0, 8).join(', ')) : ''),
    });
  }

  const maxBar = Math.max(1, ...report.monthly.map((x) => (x ? Math.abs(x.saved) : 0)));
  const delta = (actual: number, plan: number) => fmt.currencyDelta(actual - plan);

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <MonthCheckIn
          entries={entries}
          sel={sel}
          today={today}
          planRows={planRows}
          startingNetWorth={assumptions.startingNetWorth}
          onSelect={select}
          onSave={(e) => {
            onChange(upsert(entries, e));
            setPicked({ year: e.year, month: e.month });
          }}
          onClear={(ym) => onChange(remove(entries, ym.year, ym.month))}
        />
        <TrackStatus
          entries={entries}
          report={report}
          planRows={planRows}
          startingNetWorth={assumptions.startingNetWorth}
          at={sel}
          fire={fire}
          onOpenPlan={onOpenPlan}
        />
      </div>

      {/* Year-end report — also the print area. */}
      <div className="card print-area">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionLabel icon="chart">{L.reportHeading(year)}</SectionLabel>
          <div className="print-hide flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost px-2"
              onClick={() => setYear(year - 1)}
              aria-label={L.prevYear}
            >
              ‹
            </button>
            <button
              type="button"
              className="btn btn-ghost px-2"
              onClick={() => setYear(year + 1)}
              disabled={year >= today.year}
              aria-label={L.nextYear}
            >
              ›
            </button>
            {report.monthsRecorded > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                {L.print}
              </button>
            ) : null}
          </div>
        </div>

        {report.monthsRecorded === 0 ? (
          <p className="text-muted text-[13px]">{L.empty}</p>
        ) : (
          <>
            <p className="figure text-[30px]">{fmt.currency0(report.saved)}</p>
            <p className="text-muted mt-1 text-[13px]">
              {L.savedSub(
                report.monthsRecorded,
                report.savingsRatePct === null ? '—' : fmt.pct0(report.savingsRatePct),
              )}
            </p>

            <ul className="rows mt-3">
              <li className="row items-center">
                <span className="text-[13px]">{L.totalIncome}</span>
                <span className="nums text-[13px] font-medium">{fmt.currency0(report.income)}</span>
              </li>
              <li className="row items-center">
                <span className="text-[13px]">{L.totalSpending}</span>
                <span className="nums text-[13px] font-medium">
                  {fmt.currency0(report.spending)}
                </span>
              </li>
              {report.netWorth ? (
                <li className="row items-center">
                  <span className="text-[13px]">{L.nwChange}</span>
                  <span
                    className={`nums text-[13px] font-medium ${report.netWorth.change >= 0 ? 'text-positive' : 'text-negative'}`}
                  >
                    {fmt.currencyDelta(report.netWorth.change)}
                  </span>
                </li>
              ) : null}
              {report.best && report.worst ? (
                <li className="row items-center">
                  <span className="text-[13px]">{L.bestWorst}</span>
                  <span className="nums text-muted text-right text-xs">
                    {monthName(report.best.month)} {fmt.currencyDelta(report.best.saved)} ·{' '}
                    {monthName(report.worst.month)} {fmt.currencyDelta(report.worst.saved)}
                  </span>
                </li>
              ) : null}
            </ul>

            {/* Saved per month — plain bars, no chart library needed. */}
            <p className="eyebrow mt-5 mb-2">{L.monthlySaved}</p>
            <ul className="flex flex-col gap-1">
              {report.monthly.map((x, i) => (
                <li key={i} className="grid grid-cols-[3rem_1fr_5.5rem] items-center gap-2">
                  <span className="text-muted text-[11px]">{monthName(i + 1)}</span>
                  <span className="bg-surface-2 h-2 overflow-hidden rounded-full">
                    {x ? (
                      <span
                        className={`block h-full rounded-full ${x.saved >= 0 ? 'bg-positive' : 'bg-negative'}`}
                        style={{ width: `${Math.max(2, (Math.abs(x.saved) / maxBar) * 100)}%` }}
                      />
                    ) : null}
                  </span>
                  <span className="nums text-muted text-right text-[11px]">
                    {x ? fmt.currencyDelta(x.saved) : '—'}
                  </span>
                </li>
              ))}
            </ul>

            {/* Where it went — only for people who log by category. */}
            {breakdown ? (
              <>
                <p className="eyebrow mt-5 mb-2">{L.byCategory}</p>
                <ul className="flex flex-col gap-2">
                  {breakdown.rows.map((r) => (
                    <li key={r.id}>
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span>{t.track.categories[r.id]}</span>
                        <span className="nums">
                          <span className="font-medium">{fmt.currency0(r.total)}</span>
                          <span className="text-muted text-[11px]">
                            {' '}
                            · {fmt.pct0(r.sharePct)} · {L.perMonth(fmt.currency0(r.monthlyAvg))}
                          </span>
                        </span>
                      </div>
                      <span className="bg-surface-2 mt-1 block h-1.5 overflow-hidden rounded-full">
                        <span
                          className="bg-accent block h-full rounded-full"
                          style={{ width: `${Math.max(1, Math.min(100, r.sharePct))}%` }}
                        />
                      </span>
                      {r.items.length ? (
                        <ul className="mt-1.5 flex flex-col gap-0.5 pl-3">
                          {r.items.map((item) => (
                            <li
                              key={item.id}
                              className="text-muted flex items-baseline justify-between gap-3 text-xs"
                            >
                              <span>{t.track.subcategories[item.id]}</span>
                              <span className="nums">
                                {fmt.currency0(item.total)} · {fmt.pct0(item.sharePct)}
                              </span>
                            </li>
                          ))}
                          {r.unitemized > 0 ? (
                            <li className="text-muted flex items-baseline justify-between gap-3 text-xs italic">
                              <span>{L.unitemized}</span>
                              <span className="nums">{fmt.currency0(r.unitemized)}</span>
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                  {breakdown.uncategorized > 0 ? (
                    <li className="text-muted flex items-baseline justify-between gap-3 text-xs">
                      <span>{L.uncategorized}</span>
                      <span className="nums">{fmt.currency0(breakdown.uncategorized)}</span>
                    </li>
                  ) : null}
                </ul>
              </>
            ) : null}

            {report.plan ? (
              <>
                <p className="eyebrow mt-5 mb-1">{L.planVsActual}</p>
                <ul className="rows">
                  <li className="row items-center">
                    <span className="text-[13px]">{L.totalSpending}</span>
                    <span className="nums text-right text-xs">
                      {fmt.currency0(report.spending)}{' '}
                      <span className="text-muted">/ {fmt.currency0(report.plan.spending)}</span>{' '}
                      <span
                        className={
                          report.spending <= report.plan.spending
                            ? 'text-positive'
                            : 'text-negative'
                        }
                      >
                        ({delta(report.spending, report.plan.spending)})
                      </span>
                    </span>
                  </li>
                  <li className="row items-center">
                    <span className="text-[13px]">{L.totalSaved}</span>
                    <span className="nums text-right text-xs">
                      {fmt.currency0(report.saved)}{' '}
                      <span className="text-muted">/ {fmt.currency0(report.plan.saved)}</span>{' '}
                      <span
                        className={
                          report.saved >= report.plan.saved ? 'text-positive' : 'text-negative'
                        }
                      >
                        ({delta(report.saved, report.plan.saved)})
                      </span>
                    </span>
                  </li>
                </ul>
                {report.monthsRecorded < 12 ? (
                  <p className="text-muted mt-1 text-[11px]">
                    {L.partialNote(report.monthsRecorded)}
                  </p>
                ) : null}
              </>
            ) : null}

            <div className="print-hide mt-4">
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={!patch}
                onClick={() => {
                  if (!patch) return;
                  onCalibrate(patch);
                  setNote({ tone: 'ok', text: L.calibrated });
                }}
              >
                {L.calibrate}
              </button>
              <p className="text-muted mt-1.5 text-[11px]">
                {patch ? L.calibrateHint : L.calibrateNeed}
              </p>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        className="btn print-hide w-full justify-between"
        aria-expanded={showAll}
        onClick={() => setShowAll((v) => !v)}
      >
        <span>{showAll ? L.hideAll : L.showAll}</span>
        <span className="text-muted text-[11px]">{showAll ? '−' : `+ ${L.showAllHint}`}</span>
      </button>

      {showAll ? (
        <div className="card">
          <div className="mb-1 flex items-center justify-between gap-3">
            <SectionLabel icon="coins">{L.heading}</SectionLabel>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost px-2"
                onClick={() => setYear(year - 1)}
                aria-label={L.prevYear}
              >
                ‹
              </button>
              <span className="nums text-sm font-medium">{year}</span>
              <button
                type="button"
                className="btn btn-ghost px-2"
                onClick={() => setYear(year + 1)}
                disabled={year >= today.year}
                aria-label={L.nextYear}
              >
                ›
              </button>
            </div>
          </div>
          <p className="text-muted mb-3 text-xs">{L.intro}</p>

          <div className="text-muted mb-1 grid grid-cols-[3rem_1fr_1fr_1fr] gap-2 text-[11px]">
            <span />
            <span className="text-right">{L.income}</span>
            <span className="text-right">{L.spending}</span>
            <span className="text-right">{L.netWorth}</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => {
              const e = entries.find((x) => x.year === year && x.month === mo);
              return (
                <li
                  key={`${year}-${mo}`}
                  className="grid grid-cols-[3rem_1fr_1fr_1fr] items-center gap-2"
                >
                  <span className="text-muted text-xs">{monthName(mo)}</span>
                  <Cell
                    value={e?.income}
                    label={`${monthName(mo)} ${L.income}`}
                    onCommit={(n) => edit(mo, 'income', n)}
                  />
                  <Cell
                    value={e?.spending}
                    label={`${monthName(mo)} ${L.spending}`}
                    lockedHint={e?.categories ? L.lockedSpending : undefined}
                    onCommit={(n) => edit(mo, 'spending', n)}
                  />
                  <Cell
                    value={e?.netWorth}
                    label={`${monthName(mo)} ${L.netWorth}`}
                    allowNegative
                    onCommit={(n) => edit(mo, 'netWorth', n)}
                  />
                </li>
              );
            })}
          </ul>

          <hr className="rule my-4" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => download(`ledger-template-${year}.csv`, templateCsv(year))}
            >
              {L.template}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                download(`ledger-template-${year}-detailed.csv`, templateCsv(year, true))
              }
            >
              {L.templateDetailed}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                download(
                  `ledger-template-${year}-full.csv`,
                  templateCsv(year, 'full', { ...t.track.categories, ...t.track.subcategories }),
                )
              }
            >
              {L.templateFull}
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              {L.importCsv}
            </button>
            <button
              type="button"
              className="btn"
              disabled={entries.length === 0}
              onClick={() => download('ledger.csv', toCsv(entries))}
            >
              {L.exportCsv}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {note ? (
            <p className={`mt-2 text-xs ${note.tone === 'ok' ? 'text-positive' : 'text-negative'}`}>
              {note.text}
            </p>
          ) : null}
          <p className="text-muted mt-3 flex items-start gap-2 text-[11px] italic">
            <Icon name="shield" size={11} className="mt-px shrink-0" />
            {L.privacy}
          </p>
        </div>
      ) : null}
    </section>
  );
}
