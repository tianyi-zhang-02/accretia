'use client';

import { useI18n } from '@/lib/i18n/locale';
import type { YearRow } from '@/lib/simulator/engine';
import type { Person } from '@/lib/validation/scenarios';

export default function YearTable({
  rows,
  people,
  highlightYears,
}: {
  rows: YearRow[];
  people: Person[];
  /** Years to highlight (career switch, windfall, major expense). */
  highlightYears: Set<number>;
}) {
  const { t, fmt } = useI18n();
  if (rows.length === 0) return null;

  return (
    <div className="border-border overflow-x-auto rounded border">
      <table className="nums w-full min-w-[640px] text-xs">
        <thead className="text-muted text-[11px] tracking-wide uppercase">
          <tr className="border-border border-b">
            <th className="px-2 py-2 text-left">{t.table.year}</th>
            {people.length > 0 ? <th className="px-2 py-2 text-left">{t.table.ages}</th> : null}
            <th className="px-2 py-2 text-right">{t.table.gross}</th>
            <th className="px-2 py-2 text-right">{t.table.afterTax}</th>
            <th className="px-2 py-2 text-right">{t.table.expenses}</th>
            <th className="px-2 py-2 text-right">{t.table.windfalls}</th>
            <th className="px-2 py-2 text-right">{t.table.saved}</th>
            <th className="px-2 py-2 text-right">{t.table.growth}</th>
            <th className="px-2 py-2 text-right">{t.table.netWorth}</th>
            <th className="px-2 py-2 text-right">{t.table.real}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const hot = highlightYears.has(r.year);
            return (
              <tr
                key={r.year}
                className={`border-border border-b last:border-b-0 ${hot ? 'bg-foreground/[0.03]' : ''}`}
              >
                <td className="px-2 py-1.5 text-left">{r.year}</td>
                {people.length > 0 ? (
                  <td className="text-muted px-2 py-1.5 text-left">
                    {people.map((p) => r.ages[p.id] ?? 0).join(' / ')}
                  </td>
                ) : null}
                <td className="px-2 py-1.5 text-right">{fmt.currency0(r.grossIncome)}</td>
                <td className="px-2 py-1.5 text-right">{fmt.currency0(r.afterTaxIncome)}</td>
                <td className="px-2 py-1.5 text-right">{fmt.currency0(r.expenses)}</td>
                <td
                  className={`px-2 py-1.5 text-right ${r.windfalls > 0 ? 'text-positive' : 'text-muted'}`}
                >
                  {r.windfalls === 0 ? '—' : fmt.currency0(r.windfalls)}
                </td>
                <td className={`px-2 py-1.5 text-right ${r.saved < 0 ? 'text-negative' : ''}`}>
                  {fmt.currency0(r.saved)}
                </td>
                <td className="text-muted px-2 py-1.5 text-right">
                  {fmt.currency0(r.investmentGrowth)}
                </td>
                <td className="px-2 py-1.5 text-right font-medium">{fmt.currency0(r.netWorth)}</td>
                <td className="text-muted px-2 py-1.5 text-right">
                  {fmt.currency0(r.netWorthRealTodayDollars)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
