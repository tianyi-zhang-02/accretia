'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { ledgerInsights, type LedgerInsight } from '@/lib/ledger/insights';
import type { Budgets } from '@/lib/ledger/budgets';
import type { MonthEntry } from '@/lib/ledger/ledger';
import type { YearRow } from '@/lib/simulator/engine';

import { SectionLabel } from '../ui/icon';

/**
 * "What this month shows" — a few sentences comparing the latest logged
 * month with the person's own recent months (lib/ledger/insights.ts).
 */
export default function LedgerFindings({
  entries,
  planRows,
  budgets,
}: {
  entries: MonthEntry[];
  planRows: YearRow[];
  budgets: Budgets;
}) {
  const { t, fmt, locale } = useI18n();
  const F = t.track.findings;
  const { focus, insights } = useMemo(
    () => ledgerInsights(entries, planRows, 4, budgets),
    [entries, planRows, budgets],
  );
  if (!focus) return null;

  const month = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(focus.year, focus.month - 1, 1));
  const c = fmt.currency0;

  const say = (i: LedgerInsight): string => {
    switch (i.id) {
      case 'spendingVsUsual':
        return i.pct > 0
          ? F.spendingUp(i.pct, c(i.amount), c(i.usual))
          : F.spendingDown(-i.pct, c(i.amount), c(i.usual));
      case 'vsLastYear':
        return i.pct > 0
          ? F.lastYearUp(i.pct, c(i.amount), c(i.then))
          : F.lastYearDown(-i.pct, c(i.amount), c(i.then));
      case 'categoryJump':
        return F.categoryJump(t.track.categories[i.category], c(i.amount), c(i.usual));
      case 'categoryDrop':
        return F.categoryDrop(t.track.categories[i.category], c(i.amount), c(i.usual));
      case 'savingsRate':
        return i.ratePct >= i.usualPct
          ? F.savingsUp(i.ratePct, i.usualPct)
          : F.savingsDown(i.ratePct, i.usualPct);
      case 'netWorthChange':
        return i.change >= 0
          ? F.netWorthUp(c(i.change), i.months)
          : F.netWorthDown(c(-i.change), i.months);
      case 'yearPace':
        return i.projected >= i.plan
          ? F.paceAhead(i.year, c(i.projected), c(i.plan))
          : F.paceBehind(i.year, c(i.projected), c(i.plan));
      case 'splurgeShare':
        return F.splurge(i.pct, c(i.amount));
      case 'overBudget':
        return F.overBudget(i.count, t.track.categories[i.category], c(i.over));
      case 'withinBudget':
        return F.withinBudget(i.count);
      case 'firstMonth':
        return F.firstMonth;
    }
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon="spark">{F.heading}</SectionLabel>
        <span className="text-muted text-xs">{month}</span>
      </div>
      {insights.length ? (
        <ul className="rows mt-2">
          {insights.map((i) => (
            <li key={i.id} className="flex items-start gap-3 py-3 first:pt-1 last:pb-1">
              <span
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  i.tone === 'good'
                    ? 'bg-positive'
                    : i.tone === 'warn'
                      ? 'bg-negative'
                      : 'bg-foreground/40'
                }`}
              />
              <span className="text-[13px] leading-relaxed">{say(i)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted mt-2 text-[13px]">{F.none}</p>
      )}
      <p className="text-muted mt-3 text-[11px]">{F.note}</p>
    </section>
  );
}
