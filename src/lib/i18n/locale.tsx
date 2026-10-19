'use client';

/**
 * Locale plumbing — client only, nothing stored.
 *
 * The active language lives in the URL as `?lang=zh` (or `en`). That makes a
 * chosen language shareable and survive a refresh WITHOUT any localStorage /
 * cookie — consistent with the rest of the app, which keeps all state in
 * memory and in the URL only. When no `?lang` is present we fall back to the
 * browser's language once, on mount (so a zh-CN browser opens in Chinese),
 * but we never write storage.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { MESSAGES, type Locale, type Messages } from './messages';

function normalize(value: string | null): Locale | null {
  return value === 'zh' ? 'zh' : value === 'en' ? 'en' : null;
}

// Read the browser's language without a hydration mismatch or setState-in-
// effect: the server snapshot is always 'en'; the client snapshot reads
// navigator once. navigator.language doesn't change, so subscribe is a no-op.
const subscribeNoop = () => () => {};
const detectBrowserLocale = (): Locale =>
  navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const serverLocale = (): Locale => 'en';

/** Locale-aware value formatters. Currency stays USD (presets are US-based). */
export type Formatters = {
  /** Whole-dollar USD, e.g. $1,234,567 (zh renders US$…). */
  currency0: (n: number) => string;
  /** Signed whole-dollar USD, e.g. +$1,000 / −$500. */
  currencyDelta: (n: number) => string;
  /** Compact number, e.g. 1.2M (zh uses 万/亿) — for chart axes. */
  compact: (n: number) => string;
  /** Signed percent to 1 dp, e.g. +12.3%. */
  signedPct1: (n: number) => string;
  /** Percent, no sign, configurable dp, e.g. 6.5%. */
  pct: (n: number, digits?: number) => string;
  /** Rounded whole percent, e.g. 70%. */
  pct0: (n: number) => string;
};

function makeFormatters(locale: Locale): Formatters {
  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const currency = new Intl.NumberFormat(tag, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 });
  // Whole dollars: a value that rounds to zero is "$0" (never "-$0"), and a
  // negative uses the true minus sign, like currencyDelta does.
  const currency0 = (n: number) => {
    if (!Number.isFinite(n)) return '—';
    const r = Math.round(n);
    return r < 0 ? `−${currency.format(-r)}` : currency.format(r === 0 ? 0 : r);
  };
  return {
    currency0,
    currencyDelta: (n) =>
      Number.isFinite(n) ? `${Math.round(n) >= 0 ? '+' : '−'}${currency0(Math.abs(n))}` : '—',
    compact: (n) => (Number.isFinite(n) ? compact.format(n) : '—'),
    // Keep the explicit +/− sign the projection UI relies on.
    signedPct1: (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`,
    pct: (n, digits = 1) => `${n.toFixed(digits)}%`,
    pct0: (n) => `${Math.round(n)}%`,
  };
}

type I18nValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Messages;
  fmt: Formatters;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const paramLocale = normalize(searchParams.get('lang'));
  // Browser default (server → 'en'; client → navigator). An explicit ?lang
  // always wins over detection.
  const detected = useSyncExternalStore(subscribeNoop, detectBrowserLocale, serverLocale);

  const locale: Locale = paramLocale ?? detected;

  // Reflect the language on <html lang> for a11y / correct font shaping.
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const setLocale = (next: Locale) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('lang', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };
    return { locale, setLocale, t: MESSAGES[locale], fmt: makeFormatters(locale) };
  }, [locale, pathname, router, searchParams]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <LocaleProvider>');
  return ctx;
}
