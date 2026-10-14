'use client';

import { useEffect, useRef, useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { LOCALES, LOCALE_LABEL } from '@/lib/i18n/messages';

import Icon from './icon';

export type ThemePref = 'system' | 'light' | 'dark';

/**
 * One quiet button in the header instead of four: appearance, text size and
 * language live in a small popover. Closes on outside click and Escape.
 */
export default function SettingsMenu({
  theme,
  onTheme,
  fontScale,
  onFontScale,
}: {
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
  fontScale: number;
  onFontScale: (s: number) => void;
}) {
  const { t, locale, setLocale } = useI18n();
  const S = t.settings;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const step = (d: number) =>
    onFontScale(Math.min(1.4, Math.max(0.8, Math.round((fontScale + d) * 10) / 10)));

  const seg = (active: boolean) =>
    `min-h-8 flex-1 px-2 text-xs font-medium transition-colors ${
      active ? 'bg-foreground text-background' : 'text-muted hover:text-foreground'
    }`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={S.aria}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-sm px-2"
      >
        <Icon name="sliders" size={16} />
      </button>
      {open ? (
        <div role="dialog" aria-label={S.aria} className="popover fade-in top-10 right-0 w-64 p-3">
          <p className="text-muted mb-1.5 text-xs">{S.appearance}</p>
          <div className="bg-surface-2 flex overflow-hidden rounded-[10px]">
            {(['system', 'light', 'dark'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={theme === v}
                onClick={() => onTheme(v)}
                className={seg(theme === v)}
              >
                {S[v]}
              </button>
            ))}
          </div>

          <p className="text-muted mt-3 mb-1.5 text-xs">{S.textSize}</p>
          <div className="bg-surface-2 flex items-center overflow-hidden rounded-[10px]">
            <button
              type="button"
              aria-label={t.controls.smaller}
              disabled={fontScale <= 0.8}
              onClick={() => step(-0.1)}
              className={`${seg(false)} disabled:opacity-40`}
            >
              A−
            </button>
            <span className="nums flex-1 text-center text-xs">{Math.round(fontScale * 100)}%</span>
            <button
              type="button"
              aria-label={t.controls.larger}
              disabled={fontScale >= 1.4}
              onClick={() => step(0.1)}
              className={`${seg(false)} text-sm disabled:opacity-40`}
            >
              A+
            </button>
          </div>

          <p className="text-muted mt-3 mb-1.5 text-xs">{S.language}</p>
          <div className="bg-surface-2 flex overflow-hidden rounded-[10px]">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={locale === l}
                onClick={() => setLocale(l)}
                className={seg(locale === l)}
              >
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
