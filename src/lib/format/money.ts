/**
 * The one place currency, percent, delta, date, and quantity formatting
 * lives. Six inline `fmtCurrency` copies in the app's first draft made
 * "$1,200" vs "$1,200.00" vs "USD 1200" easy to mix up — every surface
 * now reads from these helpers so spreadsheets-of-the-eye match.
 */

const DEFAULT_CURRENCY = 'USD';

export type Tone = 'positive' | 'negative' | 'muted';

/** Currency with the symbol in `narrowSymbol` form. Cents off by default. */
export function formatCurrency(
  n: number,
  opts?: { currency?: string; withCents?: boolean },
): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: opts?.currency ?? DEFAULT_CURRENCY,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: opts?.withCents ? 2 : 0,
  }).format(n);
}

/** Compact form for chart axis ticks ("$1.2M" rather than "$1,200,000"). */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

/** Signed delta in currency, with the right glyph and absolute value. */
export function formatDelta(n: number, opts?: { currency?: string; withCents?: boolean }): string {
  if (!Number.isFinite(n) || n === 0) return formatCurrency(0, opts);
  const sign = n > 0 ? '+ ' : '− ';
  return `${sign}${formatCurrency(Math.abs(n), opts)}`;
}

/** Percent with a fixed number of decimals — no sign unless asked. */
export function formatPct(n: number, opts?: { decimals?: number; signed?: boolean }): string {
  if (!Number.isFinite(n)) return '—';
  const d = opts?.decimals ?? 1;
  const sign = opts?.signed && n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(d)}%`;
}

/** Quantity with up to 8 decimals (matches the holdings cap). */
export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 8,
    minimumFractionDigits: 0,
  }).format(n);
}

/** Tone class corresponding to a delta — pairs with formatDelta. */
export function toneClass(n: number, neutralIsMuted = true): string {
  if (!Number.isFinite(n) || n === 0) return neutralIsMuted ? 'text-muted' : '';
  return n > 0 ? 'text-positive' : 'text-negative';
}

/** YYYY-MM-DD → "May 27" / "May 27, 2024" depending on year. */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  }).format(d);
}

/** YYYY-MM-DD → "May 2024". */
export function formatMonthYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d);
}

/** Just the month name from a YYYY-MM-DD (chart x-axis use). */
export function formatMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
}
