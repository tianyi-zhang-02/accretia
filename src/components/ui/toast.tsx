'use client';

import { createContext, useCallback, useContext, useState } from 'react';

/**
 * Tiny toast system — context provider + `useToast()` hook + container.
 *
 * Rationale for not pulling in react-hot-toast / sonner: this app's needs
 * are small (success / error after a mutation), strict CSP forbids
 * external scripts, and CLAUDE.md asks before adding deps. ~70 lines
 * gets us identical-looking feedback across every mutation.
 *
 * Toasts auto-dismiss after DISMISS_MS (matched to "long enough to read,
 * short enough not to nag"). Multiple toasts stack with the newest on top.
 */

const DISMISS_MS = 3_500;

export type ToastKind = 'success' | 'error' | 'info';

type Toast = { id: string; kind: ToastKind; message: string };

type ToastContextValue = {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DISMISS_MS);
  }, []);

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto toast-in border-border bg-background/95 max-w-md rounded border px-3 py-2 text-xs shadow-lg backdrop-blur ${
            t.kind === 'success'
              ? 'text-positive'
              : t.kind === 'error'
                ? 'text-negative'
                : 'text-foreground'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
