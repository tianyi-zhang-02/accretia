'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

/**
 * Context-aware "+" button. Replaces the raised center nav anchor — instead
 * of always jumping to /transactions/new, taps a bottom sheet with four
 * shortcuts so any "add" surface is reachable from anywhere.
 *
 * Targets:
 *   Add transaction → /transactions/new (existing standalone form)
 *   Add holding     → /portfolio?add=1  (portfolio-client opens the form on mount)
 *   Add account     → /accounts?add=1   (accounts-client opens the form on mount)
 *   Update balances → /accounts/update  (existing bulk page)
 */
const ITEMS: Array<{ href: string; label: string; hint: string }> = [
  { href: '/transactions/new', label: 'Add transaction', hint: 'Income, expense, savings flow' },
  { href: '/portfolio?add=1', label: 'Add holding', hint: 'Stock, ETF, or crypto position' },
  { href: '/accounts?add=1', label: 'Add account', hint: 'New cash, savings, brokerage, etc.' },
  { href: '/accounts/update', label: 'Update balances', hint: 'Bulk month-end snapshot' },
];

export default function PlusMenu() {
  const [open, setOpen] = useState(false);

  // Close on Esc; restore body scroll lock when the sheet is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Add"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="bg-accent text-background absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-black/40 ring-1 ring-black/20 transition hover:brightness-110 active:scale-95"
      >
        <Plus size={24} strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add menu"
          className="fixed inset-0 z-50 flex items-end justify-center"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          {/* Sheet */}
          <div className="border-border bg-background relative mx-3 mb-3 w-full max-w-md rounded-2xl border p-3 shadow-2xl pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Add</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground text-xs"
              >
                Close
              </button>
            </div>
            <ul className="divide-border divide-y">
              {ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="hover:bg-foreground/5 flex items-center justify-between gap-3 rounded-lg px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm">{item.label}</p>
                      <p className="text-muted mt-0.5 text-[11px]">{item.hint}</p>
                    </div>
                    <span className="text-muted text-xs">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
