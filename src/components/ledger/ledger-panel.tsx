'use client';

import { useMemo, useRef, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import {
  calibrationPatch,
  parseLedgerCsv,
  remove,
  templateCsv,
  toCsv,
  upsert,
  yearReport,
  type MonthEntry,
} from '@/lib/ledger/ledger';
import type { YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

import PixelIcon, { PixelLabel } from '../pixel/pixel-icon';

/**
 * Monthly ledger + year-end report.
 *
 * Three numbers a month, typed here or filled into the CSV template in
 * Excel and imported. The report compares the year against the projection
 * and can push the real numbers back into the plan. Nothing leaves the
 * device: import is a local file read, export is a Blob download.
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
  onCommit,
}: {
  value: number | undefined;
  label: string;
  allowNegative?: boolean;
  onCommit: (n: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined || value === 0 ? '' : String(value));
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
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
  onCalibrate,
}: {
  entries: MonthEntry[];
  onChange: (next: MonthEntry[]) => void;
  assumptions: Assumptions;
  planRows: YearRow[];
  onCalibrate: (patch: Partial<Assumptions>) => void;
}) {
  const { t, fmt, locale } = useI18n();
  const L = t.ledger;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const monthName = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' });
    return (m: number) => f.format(new Date(2000, m - 1, 1));
  }, [locale]);

  const report = useMemo(() => yearReport(entries, year, planRows), [entries, year, planRows]);
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
    if (res.entries[0]) setYear(res.entries.at(-1)!.year);
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
      <div className="card">
        <div className="mb-1 flex items-center justify-between gap-3">
          <PixelLabel icon="coins">{L.heading}</PixelLabel>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost px-2"
              onClick={() => setYear((y) => y - 1)}
              aria-label={L.prevYear}
            >
              ‹
            </button>
            <span className="nums text-sm font-medium">{year}</span>
            <button
              type="button"
              className="btn btn-ghost px-2"
              onClick={() => setYear((y) => y + 1)}
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
          <PixelIcon name="shield" size={11} className="mt-px shrink-0" />
          {L.privacy}
        </p>
      </div>

      {/* Year-end report — also the print area. */}
      <div className="card print-area">
        <div className="mb-3 flex items-center justify-between gap-3">
          <PixelLabel icon="chart">{L.reportHeading(year)}</PixelLabel>
          {report.monthsRecorded > 0 ? (
            <button
              type="button"
              className="btn btn-ghost print-hide"
              onClick={() => window.print()}
            >
              {L.print}
            </button>
          ) : null}
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
    </section>
  );
}
