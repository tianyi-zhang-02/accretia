'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/format/money';
import type { Account } from '@/lib/types/account';

type Row = {
  account: Account;
  latest: { balance: string; snapshot_date: string } | null;
};

/** Last day of the most recent completed month, YYYY-MM-DD (local time). */
function defaultSnapshotDate(): string {
  const now = new Date();
  // Day 0 of the current month = last day of the previous month.
  const d = new Date(now.getFullYear(), now.getMonth(), 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtPrev(s: Row['latest'], currency: string): string {
  if (!s) return 'No prior snapshot';
  const n = Number(s.balance);
  if (!Number.isFinite(n)) return s.balance;
  return `Prev ${formatCurrency(n, { currency, withCents: true })} · ${s.snapshot_date}`;
}

export default function UpdateClient({ seeded }: { seeded: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState<string>(defaultSnapshotDate());
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (seeded.length === 0) {
    return (
      <div className="border-border text-muted rounded border border-dashed p-6 text-center text-sm">
        Add an account first — there&apos;s nothing to snapshot.
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const entries: Array<{ account_id: string; balance: number }> = [];
    for (const row of seeded) {
      const raw = (values[row.account.id] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        toast.error(`Invalid number for ${row.account.name}.`);
        return;
      }
      entries.push({ account_id: row.account.id, balance: n });
    }

    if (entries.length === 0) {
      toast.error('Enter at least one balance.');
      return;
    }

    setSubmitting(true);
    const res = await fetch('/api/snapshots/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshot_date: date, entries }),
    });
    setSubmitting(false);

    if (!res.ok) {
      toast.error('Save failed. Try again.');
      return;
    }

    const json = (await res.json()) as { count: number };
    const n = json.count ?? entries.length;
    toast.success(`Saved ${n} snapshot${n === 1 ? '' : 's'}.`);
    setValues({});
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="border-border flex items-center justify-between gap-3 rounded border p-3">
        <span className="text-muted text-xs">Snapshot date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border-border bg-background nums rounded border px-2 py-1 text-sm"
        />
      </label>

      <ul className="flex flex-col gap-2">
        {seeded.map((row) => (
          <li
            key={row.account.id}
            className="border-border flex items-center justify-between gap-3 rounded border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{row.account.name}</p>
              <p className="text-muted nums mt-0.5 text-[11px]">
                {fmtPrev(row.latest, row.account.currency)}
              </p>
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="Skip"
              value={values[row.account.id] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [row.account.id]: e.target.value }))}
              className="border-border focus:border-foreground nums w-32 rounded border bg-transparent px-2 py-1.5 text-right text-sm outline-none"
              aria-label={`New balance for ${row.account.name}`}
            />
          </li>
        ))}
      </ul>

      <div className="flex justify-between gap-2">
        <Link href="/accounts" className="text-muted hover:text-foreground self-center text-xs">
          ← Back
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="bg-foreground text-background rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save snapshots'}
        </button>
      </div>
    </form>
  );
}
