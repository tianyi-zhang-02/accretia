'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import type { YearReview as Review } from '@/lib/ledger/review';

import MetalCard, { Chip } from '../ui/metal-card';

/**
 * The year in review, as one card worth a screenshot. A native <dialog>
 * (focus is trapped and Escape closes it for free). "Hide amounts" swaps
 * every dollar figure for dots so it can be shared without the numbers;
 * "Copy as text" puts the same facts on the clipboard. Nothing is sent.
 */
export default function YearReview({
  review,
  open,
  onClose,
}: {
  review: Review;
  open: boolean;
  onClose: () => void;
}) {
  const { t, fmt, locale } = useI18n();
  const R = t.track.review;
  const ref = useRef<HTMLDialogElement>(null);
  const [hide, setHide] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const money = (n: number) => (hide ? '•••' : fmt.currency0(n));
  const delta = (n: number) => (hide ? (n >= 0 ? '+•••' : '−•••') : fmt.currencyDelta(n));
  const monthName = (m: number) =>
    new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'long' }).format(
      new Date(2000, m - 1, 1),
    );

  const tiles = useMemo(() => {
    const out: Array<{ label: string; value: string; sub?: string; tone?: 'good' | 'bad' }> = [];
    const r = review;
    if (r.netWorth)
      out.push({
        label: R.netWorth,
        value: delta(r.netWorth.change),
        sub: R.fromTo(money(r.netWorth.start), money(r.netWorth.end)),
        tone: r.netWorth.change >= 0 ? 'good' : 'bad',
      });
    if (r.topCategory)
      out.push({
        label: R.topCategory,
        value: t.track.categories[r.topCategory.id],
        sub: R.share(fmt.pct0(r.topCategory.sharePct), money(r.topCategory.total)),
      });
    if (r.topItem)
      out.push({
        label: R.topItem,
        value: t.track.subcategories[r.topItem.id],
        sub: money(r.topItem.total),
      });
    if (r.best && r.monthsLogged >= 2)
      out.push({
        label: R.best,
        value: monthName(r.best.month),
        sub: R.keptThatMonth(money(r.best.saved)),
      });
    out.push({ label: R.run, value: R.months(r.longestRun) });
    if (r.vsLastYear && (r.vsLastYear.ratePts !== null || r.vsLastYear.spendingPct !== null)) {
      const pts = r.vsLastYear.ratePts;
      out.push({
        label: R.vsLastYear,
        value: pts !== null ? R.points(Math.round(pts)) : '—',
        sub:
          r.vsLastYear.spendingPct !== null
            ? R.spending(Math.round(r.vsLastYear.spendingPct))
            : undefined,
        tone: pts === null ? undefined : pts >= 0 ? 'good' : 'bad',
      });
    }
    if (r.budgets)
      out.push({
        label: R.budgets,
        value: R.budgetMonths(r.budgets.kept, r.budgets.of),
        tone: r.budgets.kept === r.budgets.of ? 'good' : undefined,
      });
    if (r.vsPlan !== null)
      out.push({
        label: R.vsPlan,
        value: delta(r.vsPlan),
        sub: r.vsPlan >= 0 ? R.ahead : R.behind,
        tone: r.vsPlan >= 0 ? 'good' : 'bad',
      });
    if (r.goalsReached > 0) out.push({ label: R.goals, value: R.goalsReached(r.goalsReached) });
    return out;
    // money/delta/monthName depend only on hide, fmt and locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, hide, fmt, locale, t]);

  const rate = review.savingsRatePct === null ? null : fmt.pct0(review.savingsRatePct);
  const text = [
    R.textTitle(review.year),
    R.textSaved(money(review.saved), rate, review.monthsLogged),
    ...tiles.map((x) =>
      locale === 'zh'
        ? `${x.label}：${x.value}${x.sub ? `（${x.sub}）` : ''}`
        : `${x.label}: ${x.value}${x.sub ? ` (${x.sub})` : ''}`,
    ),
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="review"
      aria-label={R.title(review.year)}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{R.title(review.year)}</h2>
          <button
            type="button"
            className="btn btn-ghost px-2"
            aria-label={R.close}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <MetalCard className="flex min-h-[190px] flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <span className="metal-muted text-[13px]">
              {R.heroLabel(review.year, review.monthsLogged)}
            </span>
            <Chip />
          </div>
          <div>
            <p className="metal-figure text-[38px]">{money(review.saved)}</p>
            {rate ? <p className="mt-1 text-[13px]">{R.heroSub(rate)}</p> : null}
          </div>
          <div className="flex items-end justify-between gap-3">
            <span className="metal-muted nums text-[11px]">{review.year}</span>
            <span className="metal-mark">Work Optional</span>
          </div>
        </MetalCard>

        <ul className="grid grid-cols-2 gap-2">
          {tiles.map((x) => (
            <li key={x.label} className="bg-surface-2 flex flex-col gap-0.5 rounded-[12px] p-3">
              <span className="text-muted text-[11px]">{x.label}</span>
              <span
                className={`text-[16px] leading-tight font-semibold ${x.tone === 'good' ? 'text-positive' : x.tone === 'bad' ? 'text-negative' : ''}`}
              >
                {x.value}
              </span>
              {x.sub ? <span className="text-muted text-[11px] leading-snug">{x.sub}</span> : null}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={hide}
              onChange={(e) => setHide(e.target.checked)}
            />
            {R.hide}
          </label>
          <button type="button" className="btn" onClick={copy}>
            {copied ? R.copied : R.copy}
          </button>
        </div>
        <p className="text-muted text-[11px]">{R.privacy}</p>
      </div>
    </dialog>
  );
}
