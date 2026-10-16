'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n/locale';

import Icon from '../ui/icon';
import { useAppUpdate } from './sw-register';

/**
 * "A new version is ready" — shown on every section once a newer version of
 * the app is installed behind this page (see sw-register.tsx). Never in dev,
 * never on a first install. Non-blocking: "Later" hides it until next time.
 */
export default function UpdateBanner() {
  const { t } = useI18n();
  const { ready, refresh } = useAppUpdate();
  const [later, setLater] = useState(false);
  if (!ready || later) return null;
  return (
    <div
      role="status"
      className="card card-tight fade-in print-hide flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <p className="flex min-w-0 flex-1 items-start gap-2.5 text-[13px]">
        <Icon name="refresh" size={16} className="text-accent mt-0.5" />
        <span>
          <span className="font-medium">{t.update.ready}</span> {t.update.body}
        </span>
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={refresh}>
          {t.update.refresh}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLater(true)}>
          {t.update.later}
        </button>
      </div>
    </div>
  );
}

/** The action under every "this data comes from a newer version" message. */
export function RefreshToUpdate({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { refresh } = useAppUpdate();
  return (
    <button type="button" className={`btn btn-sm ${className}`} onClick={refresh}>
      <Icon name="refresh" size={14} />
      {t.update.refreshToUpdate}
    </button>
  );
}
