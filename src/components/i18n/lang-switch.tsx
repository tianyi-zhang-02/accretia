'use client';

import { useI18n } from '@/lib/i18n/locale';
import { LOCALES, LOCALE_LABEL } from '@/lib/i18n/messages';

/**
 * EN · 中文 toggle. Writes the choice to the `?lang` query param (via the
 * provider) — shareable, refresh-safe, nothing stored.
 */
export default function LangSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="border-border flex rounded border text-xs" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`px-2 py-0.5 ${
            locale === l ? 'bg-foreground/10 text-foreground' : 'text-muted hover:text-foreground'
          }`}
        >
          {LOCALE_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
