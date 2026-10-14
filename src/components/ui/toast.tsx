'use client';

import { useEffect } from 'react';

import { useI18n } from '@/lib/i18n/locale';

export type ToastMessage = { id: number; text: string; undo?: () => void };

/**
 * One message at a time, bottom of the screen, gone after a few seconds.
 * Destructive actions pass `undo` — cheaper and kinder than a confirm dialog.
 */
export default function Toast({
  toast,
  onDone,
}: {
  toast: ToastMessage | null;
  onDone: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(onDone, toast.undo ? 6000 : 3000);
    return () => window.clearTimeout(id);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="toast toast-in print-hide" key={toast.id}>
      <span className="min-w-0">{toast.text}</span>
      {toast.undo ? (
        <button
          type="button"
          onClick={() => {
            toast.undo?.();
            onDone();
          }}
          className="shrink-0 rounded-[8px] px-2.5 py-1 text-[13px] font-semibold underline-offset-2 hover:underline"
        >
          {t.toast.undo}
        </button>
      ) : null}
    </div>
  );
}
