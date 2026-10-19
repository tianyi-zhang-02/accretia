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
          <div className="seg seg-fill">
            {(['system', 'light', 'dark'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={theme === v} onClick={() => onTheme(v)}>
                {S[v]}
              </button>
            ))}
          </div>

          <p className="text-muted mt-3 mb-1.5 text-xs">{S.textSize}</p>
          <div className="seg seg-fill items-center">
            <button
              type="button"
              aria-label={t.controls.smaller}
              disabled={fontScale <= 0.8}
              onClick={() => step(-0.1)}
            >
              A−
            </button>
            <span className="nums flex-1 text-center text-xs">{Math.round(fontScale * 100)}%</span>
            <button
              type="button"
              aria-label={t.controls.larger}
              disabled={fontScale >= 1.4}
              onClick={() => step(0.1)}
              className="text-sm"
            >
              A+
            </button>
          </div>

          <p className="text-muted mt-3 mb-1.5 text-xs">{S.language}</p>
          <div className="seg seg-fill">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={locale === l}
                onClick={() => setLocale(l)}
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
