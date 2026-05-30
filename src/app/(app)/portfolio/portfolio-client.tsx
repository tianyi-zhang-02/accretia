'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatQty } from '@/lib/format/money';
import type { Account } from '@/lib/types/account';
import type { HoldingWithAccount, Quote } from '@/lib/types/holding';
import {
  ASSET_TYPES,
  createHoldingSchema,
  type AssetType,
  type CreateHoldingInput,
} from '@/lib/validation/holdings';

const TYPE_LABEL: Record<AssetType, string> = {
  stock: 'Stock',
  etf: 'ETF',
  crypto: 'Crypto',
};

type FormMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; holding: HoldingWithAccount };

function fmtFetchedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export default function PortfolioClient({
  initialHoldings,
  accounts,
}: {
  initialHoldings: HoldingWithAccount[];
  accounts: Account[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  // Bottom-nav "+" sheet jumps here with ?add=1 to deep-link "Add holding."
  // Initialise the form state from the URL on first render; the effect below
  // strips the param.
  const [mode, setMode] = useState<FormMode>(() =>
    searchParams.get('add') === '1' && accounts.length > 0
      ? { kind: 'create' }
      : { kind: 'closed' },
  );
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  useEffect(() => {
    if (searchParams.get('add') === '1') router.replace('/portfolio');
  }, [searchParams, router]);

  const symbols = useMemo(
    () => Array.from(new Set(initialHoldings.map((h) => h.symbol))),
    [initialHoldings],
  );

  // Fetch quotes on mount (and whenever the symbol set changes).
  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    (async () => {
      setRefreshing(true);
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
        if (!res.ok) {
          if (!cancelled)
            toast.error(
              res.status === 429 ? 'Quote rate limit hit — try later.' : 'Could not load prices.',
            );
          return;
        }
        const json = (await res.json()) as { quotes: Record<string, Quote | null> };
        if (!cancelled) {
          setQuotes(json.quotes ?? {});
          setRefreshedAt(new Date().toISOString());
        }
      } catch {
        if (!cancelled) toast.error('Network error fetching prices.');
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols]);

  async function refreshPrices() {
    if (symbols.length === 0 || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
      if (!res.ok) {
        toast.error(
          res.status === 429 ? 'Quote rate limit hit — try later.' : 'Could not refresh prices.',
        );
        return;
      }
      const json = (await res.json()) as { quotes: Record<string, Quote | null> };
      setQuotes(json.quotes ?? {});
      setRefreshedAt(new Date().toISOString());
      toast.success('Prices updated.');
    } catch {
      toast.error('Network error refreshing prices.');
    } finally {
      setRefreshing(false);
    }
  }

  async function onDelete(h: HoldingWithAccount) {
    if (!confirm(`Remove ${h.symbol} from your portfolio?`)) return;
    startDelete(async () => {
      const res = await fetch(`/api/holdings/${h.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not delete. Try again.');
        return;
      }
      toast.success(`Removed ${h.symbol}.`);
      router.refresh();
    });
  }

  // ---- Per-row metrics + totals ----
  type Row = {
    h: HoldingWithAccount;
    qty: number;
    cost: number;
    price: number | null;
    value: number | null;
    pl: number | null;
    plPct: number | null;
  };
  const rows: Row[] = initialHoldings.map((h) => {
    const qty = Number(h.quantity);
    const cost = Number(h.cost_basis);
    const q = quotes[h.symbol] ?? null;
    const price = q ? q.price : null;
    const value = price !== null ? qty * price : null;
    const pl = value !== null ? value - cost : null;
    const plPct = pl !== null && cost > 0 ? (pl / cost) * 100 : null;
    return { h, qty, cost, price, value, pl, plPct };
  });

  const totalValue = rows.reduce((acc, r) => acc + (r.value ?? 0), 0);
  const totalCost = rows.reduce((acc, r) => acc + r.cost, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const anyValued = rows.some((r) => r.value !== null);

  // Group by account for display.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.h.account_id;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-6">
      {/* Top: totals */}
      <section className="border-border rounded border p-4">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Total market value</p>
        <p className="serif-display nums mt-1 text-3xl">
          {anyValued ? formatCurrency(totalValue) : '—'}
        </p>
        {anyValued ? (
          <p
            className={`nums mt-1 text-xs ${
              totalPL > 0 ? 'text-positive' : totalPL < 0 ? 'text-negative' : 'text-muted'
            }`}
          >
            {totalPL > 0 ? '+' : totalPL < 0 ? '−' : ''}
            {formatCurrency(Math.abs(totalPL))} ({totalPLPct.toFixed(1)}%) all-time
          </p>
        ) : (
          <p className="text-muted mt-1 text-xs">Add holdings to see live valuation.</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={refreshPrices}
            disabled={refreshing || symbols.length === 0}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1 text-xs disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh prices'}
          </button>
          {refreshedAt ? (
            <span className="text-muted text-[10px]">Updated {fmtFetchedAt(refreshedAt)}</span>
          ) : null}
        </div>
      </section>

      {/* Add / Edit controls */}
      <div className="flex items-center justify-between">
        <p className="text-muted text-xs">
          {initialHoldings.length} holding{initialHoldings.length === 1 ? '' : 's'}
        </p>
        {mode.kind === 'closed' ? (
          <button
            type="button"
            onClick={() => setMode({ kind: 'create' })}
            disabled={accounts.length === 0}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            + Add holding
          </button>
        ) : null}
      </div>

      {mode.kind !== 'closed' ? (
        <HoldingForm
          mode={mode}
          accounts={accounts}
          onCancel={() => setMode({ kind: 'closed' })}
          onSaved={(symbol, isEdit) => {
            setMode({ kind: 'closed' });
            toast.success(isEdit ? `Updated ${symbol}.` : `Added ${symbol}.`);
            router.refresh();
          }}
          onError={toast.error}
        />
      ) : null}

      {/* Holdings grouped by account */}
      {initialHoldings.length === 0 ? (
        accounts.length === 0 ? (
          <div className="border-border text-muted rounded border border-dashed p-6 text-center text-sm">
            Add a brokerage, retirement, or crypto account first.
          </div>
        ) : (
          <div className="border-border text-muted rounded border border-dashed p-6 text-center text-sm">
            No holdings yet. Add one to start tracking.
          </div>
        )
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(groups.entries()).map(([accountId, accRows]) => {
            const acc = accountById.get(accountId);
            const subValue = accRows.reduce((a, r) => a + (r.value ?? 0), 0);
            const subCost = accRows.reduce((a, r) => a + r.cost, 0);
            const subPL = subValue - subCost;
            return (
              <section key={accountId}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <Link
                    href={`/accounts/${accountId}`}
                    className="text-muted hover:text-foreground text-[11px] tracking-[0.18em] uppercase"
                  >
                    {acc?.name ?? 'Unknown account'} ↗
                  </Link>
                  {subCost > 0 ? (
                    <p
                      className={`nums text-[11px] ${
                        subPL > 0 ? 'text-positive' : subPL < 0 ? 'text-negative' : 'text-muted'
                      }`}
                    >
                      {subPL > 0 ? '+' : subPL < 0 ? '−' : ''}
                      {formatCurrency(Math.abs(subPL))}
                    </p>
                  ) : null}
                </div>
                <ul className="flex flex-col gap-2">
                  {accRows.map((r) => (
                    <li
                      key={r.h.id}
                      className="border-border flex items-start justify-between gap-3 rounded border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-medium">{r.h.symbol}</span>
                          <span className="text-muted text-[10px] tracking-wide uppercase">
                            {TYPE_LABEL[r.h.asset_type]}
                          </span>
                        </div>
                        <p className="text-muted nums mt-1 text-[11px]">
                          {formatQty(r.qty)} · {r.price !== null ? formatCurrency(r.price, { withCents: true }) : '—'} ea ·
                          cost {formatCurrency(r.cost)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="nums text-sm">
                          {r.value !== null ? formatCurrency(r.value) : '—'}
                        </span>
                        {r.pl !== null ? (
                          <span
                            className={`nums text-[11px] ${
                              r.pl > 0 ? 'text-positive' : r.pl < 0 ? 'text-negative' : 'text-muted'
                            }`}
                          >
                            {r.pl > 0 ? '+' : r.pl < 0 ? '−' : ''}
                            {formatCurrency(Math.abs(r.pl))}{' '}
                            {r.plPct !== null ? `(${r.plPct.toFixed(1)}%)` : ''}
                          </span>
                        ) : null}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setMode({ kind: 'edit', holding: r.h })}
                            className="text-muted hover:text-foreground text-[11px]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={pendingDelete}
                            onClick={() => onDelete(r.h)}
                            className="text-muted hover:text-negative text-[11px] disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-muted text-[10px]">
        Prices proxied through Alpha Vantage server-side and cached. Free tier ≈25 calls/day for the
        project.
      </p>
    </div>
  );
}

function HoldingForm({
  mode,
  accounts,
  onCancel,
  onSaved,
  onError,
}: {
  mode: Exclude<FormMode, { kind: 'closed' }>;
  accounts: Account[];
  onCancel: () => void;
  onSaved: (symbol: string, isEdit: boolean) => void;
  onError: (msg: string) => void;
}) {
  const editing = mode.kind === 'edit' ? mode.holding : null;
  const isEdit = !!editing;

  const form = useForm<CreateHoldingInput>({
    resolver: zodResolver(createHoldingSchema),
    defaultValues: {
      account_id: editing?.account_id ?? accounts[0]?.id ?? '',
      symbol: editing?.symbol ?? '',
      asset_type: editing?.asset_type ?? 'stock',
      quantity: editing ? Number(editing.quantity) : 0,
      cost_basis: editing ? Number(editing.cost_basis) : 0,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const endpoint = isEdit ? `/api/holdings/${editing.id}` : '/api/holdings';
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      onError(isEdit ? 'Could not save changes. Try again.' : 'Could not add holding. Try again.');
      return;
    }
    onSaved(values.symbol.toUpperCase(), isEdit);
  });

  if (accounts.length === 0) {
    return (
      <div className="border-border text-muted rounded border border-dashed p-4 text-sm">
        Add a brokerage, retirement, or crypto account first.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-border flex flex-col gap-3 rounded border p-4"
      noValidate
    >
      <p className="text-muted text-[11px] tracking-wide uppercase">
        {isEdit ? 'Edit holding' : 'New holding'}
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Symbol</span>
        <input
          type="text"
          autoFocus
          maxLength={20}
          placeholder="AAPL, VOO, BTC-USD"
          className="border-border focus:border-foreground placeholder:text-muted/50 rounded border bg-transparent px-3 py-2 text-base uppercase outline-none"
          {...form.register('symbol')}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Asset type</span>
        <select
          className="border-border focus:border-foreground bg-background rounded border px-3 py-2 text-base outline-none"
          {...form.register('asset_type')}
        >
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Account</span>
        <select
          className="border-border focus:border-foreground bg-background rounded border px-3 py-2 text-base outline-none"
          {...form.register('account_id')}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Quantity</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          className="border-border focus:border-foreground nums rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('quantity', { valueAsNumber: true })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">Total cost basis</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          className="border-border focus:border-foreground nums rounded border bg-transparent px-3 py-2 text-base outline-none"
          {...form.register('cost_basis', { valueAsNumber: true })}
        />
      </label>

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-muted hover:text-foreground rounded px-3 py-1.5 text-xs"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="bg-foreground text-background rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {form.formState.isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  );
}
