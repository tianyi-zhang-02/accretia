'use client';

import { useI18n } from '@/lib/i18n/locale';
import { annualTotal, type AnnualExpense } from '@/lib/ledger/annual';
import type { Budgets } from '@/lib/ledger/budgets';
import type { SavingsGoal } from '@/lib/ledger/goals';
import type { MonthEntry, YearMonth } from '@/lib/ledger/ledger';

import { SectionLabel } from '../ui/icon';
import AnnualCard from './annual-card';
import BudgetCard from './budget-card';
import GoalsCard from './goals-card';

export type PlansTab = 'budgets' | 'annual' | 'goals';

/**
 * Budgets, once-a-year bills and savings goals — the things set once and
 * revisited now and then — in ONE card, so Track stays about logging the
 * month and seeing where you stand. Collapsed, the heading says what's set;
 * open, a tab per tool. Open state and tab are owned by the parent so
 * "Am I on track?" can jump straight to the goals.
 */
export default function PlansCard({
  open,
  onOpenChange,
  tab,
  onTab,
  budgets,
  annual,
  goals,
  entries,
  today,
  planMonthlySpending,
  onBudgets,
  onAnnual,
  onGoals,
  notify,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: PlansTab;
  onTab: (tab: PlansTab) => void;
  budgets: Budgets;
  annual: AnnualExpense[];
  goals: SavingsGoal[];
  entries: MonthEntry[];
  today: YearMonth;
  planMonthlySpending: number | null;
  onBudgets: (next: Budgets) => void;
  onAnnual: (next: AnnualExpense[]) => void;
  onGoals: (next: SavingsGoal[]) => void;
  notify: (text: string, undo?: () => void) => void;
}) {
  const { t, fmt } = useI18n();
  const P = t.track.plans;
  const nBudgets = Object.values(budgets).filter((v) => (v ?? 0) > 0).length;
  const yearly = annualTotal(annual);
  const summary = [
    nBudgets ? P.budgetsSet(nBudgets) : null,
    yearly > 0 ? P.annualSet(fmt.currency0(yearly)) : null,
    goals.length ? P.goalsSet(goals.length) : null,
  ].filter(Boolean);

  return (
    <section className="card" id="plans-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="shrink-0">
          <SectionLabel icon="sliders">{P.heading}</SectionLabel>
        </span>
        <span className="text-muted flex min-w-0 items-center gap-2 text-right text-xs">
          <span className="leading-snug">{summary.length ? summary.join(' · ') : P.none}</span>
          <span aria-hidden>{open ? '−' : '+'}</span>
        </span>
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-4">
          <div role="tablist" aria-label={P.heading} className="seg seg-fill">
            {(['budgets', 'annual', 'goals'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => onTab(id)}
              >
                {P.tabs[id]}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === 'budgets' ? (
              <BudgetCard
                embedded
                budgets={budgets}
                entries={entries}
                today={today}
                planMonthlySpending={planMonthlySpending}
                onChange={onBudgets}
                notify={notify}
              />
            ) : tab === 'annual' ? (
              <AnnualCard
                embedded
                annual={annual}
                today={today}
                onChange={onAnnual}
                notify={notify}
              />
            ) : (
              <GoalsCard
                embedded
                goals={goals}
                entries={entries}
                today={today}
                onChange={onGoals}
                notify={notify}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
