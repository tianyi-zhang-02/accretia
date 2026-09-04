'use client';

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useI18n } from '@/lib/i18n/locale';
import type { SimulationResult, YearRow } from '@/lib/simulator/engine';

export type DisplayMode = 'nominal' | 'real' | 'both';

type Marker = {
  year: number;
  /** Vertical position on the chart (uses the base line's value). */
  value: number;
  label: string;
  tone: 'windfall' | 'expense';
};

type Point = {
  year: number;
  nominal: number;
  real: number;
  /** Low–high return band for the active single mode (unused when 'both'). */
  band: [number, number];
  /** [min, max] of nominal & real — the shaded inflation gap in 'both' mode. */
  gap: [number, number];
};

function CustomTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  mode: DisplayMode;
}) {
  const { t, fmt } = useI18n();
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;

  if (mode === 'both') {
    return (
      <div className="bg-surface-2 rounded-[10px] px-2.5 py-2 text-xs shadow-lg">
        <p className="text-muted nums">{p.year}</p>
        <p className="nums">
          <span className="text-muted">{t.projection.nominal}</span>{' '}
          <span className="font-medium">{fmt.currency0(p.nominal)}</span>
        </p>
        <p className="nums">
          <span className="text-muted">{t.projection.real}</span>{' '}
          <span className="font-medium">{fmt.currency0(p.real)}</span>
        </p>
        <p className="text-muted nums">
          {t.chart.inflationGap} {fmt.currency0(p.nominal - p.real)}
        </p>
      </div>
    );
  }

  const base = mode === 'real' ? p.real : p.nominal;
  return (
    <div className="bg-surface-2 rounded-[10px] px-2.5 py-2 text-xs shadow-lg">
      <p className="text-muted nums">
        {p.year} · {mode === 'real' ? t.chart.todaysDollars : t.chart.nominal}
      </p>
      <p className="nums font-medium">{fmt.currency0(base)}</p>
      <p className="text-muted nums">
        {fmt.currency0(p.band[0])} – {fmt.currency0(p.band[1])}
      </p>
    </div>
  );
}

function pickValue(row: YearRow, mode: 'nominal' | 'real'): number {
  return mode === 'real' ? row.netWorthRealTodayDollars : row.netWorth;
}

export default function SimulatorChart({
  result,
  mode,
  markers,
}: {
  result: SimulationResult;
  mode: DisplayMode;
  markers: Marker[];
}) {
  const { t, fmt } = useI18n();
  const both = mode === 'both';
  // In 'both' the band is hidden; compute it for whichever single mode applies.
  const bandMode: 'nominal' | 'real' = mode === 'real' ? 'real' : 'nominal';

  const data = useMemo<Point[]>(() => {
    return result.rows.map((row, i) => {
      const low = result.low[i]!;
      const high = result.high[i]!;
      const nominal = row.netWorth;
      const real = row.netWorthRealTodayDollars;
      return {
        year: row.year,
        nominal,
        real,
        band: [pickValue(low, bandMode), pickValue(high, bandMode)],
        gap: [Math.min(nominal, real), Math.max(nominal, real)],
      };
    });
  }, [result, bandMode]);

  if (data.length === 0) {
    return (
      <div className="bg-surface-2 text-muted flex h-[220px] items-center justify-center rounded-[14px] text-[13px]">
        {t.chart.adjustHorizon}
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
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
            content={<CustomTooltip mode={mode} />}
            cursor={{ stroke: 'var(--muted)', strokeWidth: 1, strokeDasharray: '2 4' }}
          />

          {both ? (
            <>
              {/* Shaded inflation gap between nominal and real. */}
              <Area
                type="monotone"
                dataKey="gap"
                stroke="none"
                fill="var(--accent)"
                fillOpacity={0.1}
                isAnimationActive={false}
                activeDot={false}
              />
              {/* Real line — muted + dashed (what it's worth in today's dollars). */}
              <Line
                type="monotone"
                dataKey="real"
                stroke="var(--muted)"
                strokeWidth={1.25}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{
                  r: 3,
                  fill: 'var(--muted)',
                  stroke: 'var(--background)',
                  strokeWidth: 1,
                }}
                isAnimationActive={false}
              />
              {/* Nominal line — solid accent (the face-value number). */}
              <Line
                type="monotone"
                dataKey="nominal"
                stroke="var(--accent)"
                strokeWidth={1.25}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: 'var(--accent)',
                  stroke: 'var(--background)',
                  strokeWidth: 1,
                }}
                isAnimationActive={false}
              />
            </>
          ) : (
            <>
              {/* Low–high band */}
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="var(--accent)"
                fillOpacity={0.14}
                isAnimationActive={false}
                activeDot={false}
              />
              {/* Base line */}
              <Line
                type="monotone"
                dataKey={mode === 'real' ? 'real' : 'nominal'}
                stroke="var(--accent)"
                strokeWidth={1.25}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: 'var(--accent)',
                  stroke: 'var(--background)',
                  strokeWidth: 1,
                }}
                isAnimationActive={false}
              />
            </>
          )}

          {markers.map((m, i) => (
            <ReferenceDot
              key={`${m.year}-${i}`}
              x={m.year}
              y={m.value}
              r={3}
              fill={m.tone === 'windfall' ? 'var(--positive)' : 'var(--negative)'}
              stroke="var(--background)"
              strokeWidth={1}
              ifOverflow="visible"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type { Marker };
