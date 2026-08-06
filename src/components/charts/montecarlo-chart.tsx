'use client';

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useI18n } from '@/lib/i18n/locale';
import type { MonteCarloResult } from '@/lib/simulator/montecarlo';

type Point = { year: number; p50: number; band: [number, number] };

function McTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
}) {
  const { t, fmt } = useI18n();
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="border-border bg-background/95 rounded border px-2 py-1.5 text-xs shadow-lg backdrop-blur">
      <p className="text-muted nums">
        {p.year} · {t.chart.todaysDollars}
      </p>
      <p className="nums font-medium">{fmt.currency0(p.p50)}</p>
      <p className="text-muted nums">
        {fmt.currency0(p.band[0])} – {fmt.currency0(p.band[1])}
      </p>
    </div>
  );
}

/** Real (today's-dollar) Monte-Carlo fan: p10–p90 band + p50 median line. */
export default function MonteCarloChart({ mc }: { mc: MonteCarloResult }) {
  const { t, fmt } = useI18n();
  const data = useMemo<Point[]>(
    () => mc.years.map((year, i) => ({ year, p50: mc.p50[i]!, band: [mc.p10[i]!, mc.p90[i]!] })),
    [mc],
  );

  if (data.length === 0) {
    return (
      <div className="border-border text-muted flex h-[220px] items-center justify-center rounded border border-dashed text-[13px]">
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
            content={<McTooltip />}
            cursor={{ stroke: 'var(--muted)', strokeWidth: 1, strokeDasharray: '2 4' }}
          />
          {/* p10–p90 fan */}
          <Area
            type="monotone"
            dataKey="band"
            stroke="none"
            fill="var(--accent)"
            fillOpacity={0.14}
            isAnimationActive={false}
            activeDot={false}
          />
          {/* p50 median */}
          <Line
            type="monotone"
            dataKey="p50"
            stroke="var(--accent)"
            strokeWidth={1.25}
            dot={false}
            activeDot={{ r: 3, fill: 'var(--accent)', stroke: 'var(--background)', strokeWidth: 1 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
