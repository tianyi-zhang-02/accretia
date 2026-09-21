'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useI18n } from '@/lib/i18n/locale';
import { simulate, type YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

/**
 * Compare-view consumes only `{id, name, assumptions}` from each scenario.
 * Typing it this narrowly lets the page pass in-memory local scenarios
 * without having to fake server-only fields.
 */
export type ComparableScenario = {
  id: string;
  name: string;
  assumptions: Assumptions;
};

const COMPARE_COLORS = [
  'var(--accent)',
  'var(--positive)',
  'var(--negative)',
  '#8b9aff', // muted blue, defined inline to avoid widening the theme
];

const MAX_SELECTED = 3;

type SimRow = { id: string; name: string; rows: YearRow[]; color: string };

/** First year (or null) at which the scenario's nominal net worth crossed `threshold`. */
function firstCrossing(rows: YearRow[], threshold: number): number | null {
  for (const r of rows) {
    if (r.netWorth >= threshold) return r.year;
  }
  return null;
}

export default function CompareView({
  scenarios,
  onExit,
}: {
  scenarios: ComparableScenario[];
  onExit: () => void;
}) {
  const { t, fmt } = useI18n();
  const [selectedIds, setSelectedIds] = useState<string[]>(
    scenarios.slice(0, Math.min(2, scenarios.length)).map((s) => s.id),
  );

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, id];
    });
  }

  const sims = useMemo<SimRow[]>(() => {
    return selectedIds
      .map((id, i) => {
        const s = scenarios.find((x) => x.id === id);
        if (!s) return null;
        try {
          return {
            id: s.id,
            name: s.name,
            rows: simulate(s.assumptions).rows,
            color: COMPARE_COLORS[i % COMPARE_COLORS.length]!,
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is SimRow => x !== null);
  }, [scenarios, selectedIds]);

  // Build a per-year data array keyed by scenario id, so Recharts can render
  // one Line per scenario from the same dataset.
  const chartData = useMemo(() => {
    if (sims.length === 0) return [];
    const years = new Set<number>();
    for (const sim of sims) for (const r of sim.rows) years.add(r.year);
    const sorted = Array.from(years).sort((a, b) => a - b);
    return sorted.map((year) => {
      const point: Record<string, number | null> = { year };
      for (const sim of sims) {
        const r = sim.rows.find((row) => row.year === year);
        point[sim.id] = r ? r.netWorth : null;
      }
      return point;
    });
  }, [sims]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-muted text-xs font-medium">{t.compare.heading}</p>
        <button type="button" onClick={onExit} className="btn">
          {t.compare.backToEditor}
        </button>
      </div>

      {scenarios.length === 0 ? (
        <div className="border-border text-muted rounded border border-dashed p-6 text-center text-sm">
          {t.compare.saveAtLeastOne}
        </div>
      ) : (
        <>
          <p className="text-muted text-[13px]">{t.compare.pickUpTo(MAX_SELECTED)}</p>
          <ul className="flex flex-col gap-1">
            {scenarios.map((s, i) => {
              const checked = selectedIds.includes(s.id);
              const disabled = !checked && selectedIds.length >= MAX_SELECTED;
              const colorIdx = selectedIds.indexOf(s.id);
              const color =
                colorIdx >= 0 ? COMPARE_COLORS[colorIdx % COMPARE_COLORS.length] : undefined;
              return (
                <li key={s.id}>
                  <label
                    className={`border-border flex items-center gap-3 rounded border p-3 text-sm ${
                      disabled ? 'opacity-50' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(s.id)}
                    />
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: color ?? 'var(--border)' }}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{s.name}</span>
                    {i === 0 ? (
                      <span className="text-muted text-[11px]">{t.compare.mostRecent}</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {sims.length > 0 ? (
        <>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={{ fill: 'var(--muted)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tickFormatter={fmt.compact}
                  tick={{ fill: 'var(--muted)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    fontSize: 11,
                  }}
                  labelStyle={{ color: 'var(--muted)' }}
                  formatter={(value, _name, item) => {
                    const n = typeof value === 'number' ? value : Number(value);
                    const key = String(item.dataKey ?? '');
                    const sim = sims.find((s) => s.id === key);
                    return [fmt.currency0(n), sim?.name ?? ''];
                  }}
                />
                {sims.map((sim) => (
                  <Line
                    key={sim.id}
                    type="monotone"
                    dataKey={sim.id}
                    stroke={sim.color}
                    strokeWidth={1.25}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-surface overflow-x-auto rounded-[14px]">
            <table className="nums w-full min-w-[480px] text-xs">
              <thead className="text-muted text-[11px] tracking-wide uppercase">
                <tr className="border-border border-b">
                  <th className="px-2 py-2 text-left">{t.compare.scenario}</th>
                  <th className="px-2 py-2 text-right">{t.compare.endBalance}</th>
                  <th className="px-2 py-2 text-right">{t.compare.vsFirst}</th>
                  <th className="px-2 py-2 text-right">{t.compare.crosses1m}</th>
                </tr>
              </thead>
              <tbody>
                {sims.map((sim, i) => {
                  const last = sim.rows[sim.rows.length - 1]!;
                  const baseline = sims[0]!.rows[sims[0]!.rows.length - 1]!.netWorth;
                  const delta = last.netWorth - baseline;
                  const cross = firstCrossing(sim.rows, 1_000_000);
                  return (
                    <tr key={sim.id} className="border-border border-b last:border-b-0">
                      <td className="px-2 py-1.5 text-left">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: sim.color }}
                            aria-hidden
                          />
                          <span className="truncate">{sim.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right">{fmt.currency0(last.netWorth)}</td>
                      <td
                        className={`px-2 py-1.5 text-right ${
                          i === 0
                            ? 'text-muted'
                            : delta > 0
                              ? 'text-positive'
                              : delta < 0
                                ? 'text-negative'
                                : 'text-muted'
                        }`}
                      >
                        {i === 0 || delta === 0 ? '—' : fmt.currencyDelta(delta)}
                      </td>
                      <td className="px-2 py-1.5 text-right">{cross ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted text-[11px]">{t.compare.note}</p>
        </>
      ) : null}
    </div>
  );
}
