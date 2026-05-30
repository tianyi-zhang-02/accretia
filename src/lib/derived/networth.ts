import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getQuote } from '@/lib/quotes/cache';
import type { AccountType } from '@/lib/validation/accounts';

/**
 * Canonical net-worth computation.
 *
 * This is the SINGLE source of truth — the dashboard, the accounts list
 * total, the /api/networth route, the simulator's "Use my actual data"
 * prefill, and savings-goal progress all call this function (directly on
 * the server, or via /api/networth from the client). If a screen needs
 * "what is X's balance right now," it MUST come through here.
 *
 * ## Holdings → net worth model (resolved during polish-pass §1)
 *
 * The spec asks holdings to "flow into net worth automatically." The
 * obvious naive read — make a brokerage account's balance equal to
 * sum(holdings × live price) — would double-count any cash sitting in
 * the brokerage that the user already captures via a snapshot. So:
 *
 *   - Brokerage / retirement / crypto with a snapshot: SNAPSHOT WINS.
 *     The user has explicitly stated this account's value at a point in
 *     time; live holdings are informational on the portfolio page only.
 *   - Brokerage / retirement / crypto WITHOUT a snapshot but WITH
 *     holdings: balance = sum(holdings × live price). Quote failures
 *     (Alpha Vantage rate-limited, unknown symbol, etc.) fall back to
 *     cost_basis for that holding so the account isn't silently zeroed.
 *   - Cash / savings / other: snapshot wins, with 0 fallback.
 *
 * The per-account `source` field tells the UI which path produced the
 * number so it can render the distinction.
 *
 * ## Historical series
 *
 * The monthly 12-period series uses snapshots only — Alpha Vantage's
 * free tier doesn't expose historical prices, and even if it did we'd
 * burn the daily quota fast. So the chart shows the trend the user has
 * manually anchored via snapshots, while the hero number can carry the
 * live-holdings adjustment for accounts without snapshots.
 */

export const LIQUID_TYPES: ReadonlySet<AccountType> = new Set(['cash', 'savings']);
export const INVESTED_TYPES: ReadonlySet<AccountType> = new Set([
  'brokerage',
  'retirement',
  'crypto',
]);

export type AccountBalance = {
  account_id: string;
  name: string;
  type: AccountType;
  currency: string;
  /**
   * 'snapshot' = latest user-entered snapshot drives the value.
   * 'holdings' = sum of live holdings (only used when no snapshot exists
   *              AND the account holds at least one holding).
   * 'none'     = neither snapshot nor holdings; value is 0.
   */
  source: 'snapshot' | 'holdings' | 'none';
  value: number;
  /** Date that anchors `value` — snapshot_date or 'now' for live holdings. */
  as_of: string | null;
};

export type NetWorthSummary = {
  total: number;
  liquid: number;
  invested: number;
  /** Most recent snapshot_date observed across active accounts, or null. */
  as_of: string | null;
};

export type NetWorthResult = {
  current: NetWorthSummary;
  /**
   * Net worth at the end of the previous calendar month, snapshot-derived
   * (live-holdings adjustment is NOT applied historically — see file
   * header). Useful for the "+ $X this month" dashboard delta.
   */
  previous_month: { as_of: string; total: number; delta: number };
  /**
   * Trailing-12-month series of (month_end, total) — snapshot-derived.
   * The chart's most-recent point can differ slightly from `current.total`
   * for users whose only invested-account record is via holdings, by
   * design (see file header).
   */
  monthly: Array<{ month_end: string; total: number }>;
  by_account: AccountBalance[];
};

type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  archived_at: string | null;
};

type SnapshotRow = {
  account_id: string;
  balance: string;
  snapshot_date: string;
};

type HoldingRow = {
  account_id: string;
  symbol: string;
  asset_type: 'stock' | 'etf' | 'crypto';
  quantity: string;
  cost_basis: string;
};

function monthEnd(year: number, month: number): string {
  // month is 0-indexed. Day 0 of (month+1) = last day of `month`.
  const d = new Date(year, month + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function netWorthAt(
  asOf: string,
  byAccount: Map<string, SnapshotRow[]>,
  activeAccountIds: Set<string>,
): number {
  let total = 0;
  for (const [accountId, snapshots] of byAccount) {
    if (!activeAccountIds.has(accountId)) continue;
    let latest: SnapshotRow | undefined;
    for (const s of snapshots) {
      if (s.snapshot_date <= asOf && (!latest || s.snapshot_date > latest.snapshot_date)) {
        latest = s;
      }
    }
    if (latest) total += Number(latest.balance);
  }
  return total;
}

/**
 * Compute the live net worth for `userId`. The supabase client should be
 * a user-scoped SSR client (the helper still adds explicit `user_id`
 * filters for defense in depth).
 *
 * Pure data fetching + math: no React, no caching beyond the price_cache
 * table that `getQuote` consults internally.
 */
export async function computeNetWorth(
  supabase: SupabaseClient,
  userId: string,
): Promise<NetWorthResult> {
  const [accountsRes, snapshotsRes, holdingsRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, user_id, name, type, currency, archived_at')
      .eq('user_id', userId),
    supabase
      .from('account_snapshots')
      .select('account_id, balance, snapshot_date')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: true }),
    supabase
      .from('holdings')
      .select('account_id, symbol, asset_type, quantity, cost_basis')
      .eq('user_id', userId),
  ]);

  if (accountsRes.error) console.warn('[networth] accounts error', { code: accountsRes.error.code });
  if (snapshotsRes.error) console.warn('[networth] snapshots error', { code: snapshotsRes.error.code });
  if (holdingsRes.error) console.warn('[networth] holdings error', { code: holdingsRes.error.code });

  const accounts = (accountsRes.data ?? []) as AccountRow[];
  const snapshots = (snapshotsRes.data ?? []) as SnapshotRow[];
  const holdings = (holdingsRes.data ?? []) as HoldingRow[];

  // ---- Group snapshots by account ----
  const snapshotsByAccount = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) {
    const arr = snapshotsByAccount.get(s.account_id) ?? [];
    arr.push(s);
    snapshotsByAccount.set(s.account_id, arr);
  }

  // ---- Resolve live prices for every distinct symbol the user holds ----
  // getQuote is server-only and consults the price_cache TTL first, so
  // most calls are sub-millisecond. Upstream Alpha Vantage calls only
  // happen when the cache row is missing or stale.
  const symbolKeys = new Map<string, { symbol: string; type: 'stock' | 'etf' | 'crypto' }>();
  for (const h of holdings) {
    const key = `${h.symbol}|${h.asset_type}`;
    if (!symbolKeys.has(key)) symbolKeys.set(key, { symbol: h.symbol, type: h.asset_type });
  }
  const quoteByKey = new Map<string, number>(); // key → price
  await Promise.all(
    Array.from(symbolKeys.values()).map(async ({ symbol, type }) => {
      const r = await getQuote(symbol, type);
      if (r.ok) quoteByKey.set(`${symbol}|${type}`, r.quote.price);
    }),
  );

  // ---- Group holdings by account, then sum to a live value per account ----
  const holdingsValueByAccount = new Map<string, { value: number; allPriced: boolean; anyHeld: boolean }>();
  for (const h of holdings) {
    const qty = Number(h.quantity);
    const cost = Number(h.cost_basis);
    const price = quoteByKey.get(`${h.symbol}|${h.asset_type}`);
    // Quote failure: fall back to cost basis so a single missing quote
    // doesn't zero an entire account.
    const value = price !== undefined && Number.isFinite(qty)
      ? qty * price
      : Number.isFinite(cost)
        ? cost
        : 0;
    const entry = holdingsValueByAccount.get(h.account_id) ?? { value: 0, allPriced: true, anyHeld: false };
    entry.value += value;
    entry.anyHeld = true;
    if (price === undefined) entry.allPriced = false;
    holdingsValueByAccount.set(h.account_id, entry);
  }

  // ---- Latest snapshot per account ----
  const latestByAccount = new Map<string, SnapshotRow>();
  for (const s of snapshots) {
    const prev = latestByAccount.get(s.account_id);
    if (!prev || s.snapshot_date > prev.snapshot_date) latestByAccount.set(s.account_id, s);
  }

  // ---- Per-account balance under the resolution rules ----
  const by_account: AccountBalance[] = [];
  let liquid = 0;
  let invested = 0;
  let total = 0;
  let mostRecent: string | null = null;
  const activeIds = new Set<string>();

  for (const a of accounts) {
    if (a.archived_at) continue;
    activeIds.add(a.id);

    const latestSnap = latestByAccount.get(a.id);
    const holdingsAgg = holdingsValueByAccount.get(a.id);

    let source: AccountBalance['source'] = 'none';
    let value = 0;
    let as_of: string | null = null;

    if (latestSnap) {
      source = 'snapshot';
      value = Number(latestSnap.balance);
      as_of = latestSnap.snapshot_date;
    } else if (holdingsAgg?.anyHeld) {
      source = 'holdings';
      value = holdingsAgg.value;
      as_of = 'now';
    }

    by_account.push({
      account_id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      source,
      value,
      as_of,
    });

    total += value;
    if (LIQUID_TYPES.has(a.type)) liquid += value;
    else if (INVESTED_TYPES.has(a.type)) invested += value;

    if (latestSnap && (!mostRecent || latestSnap.snapshot_date > mostRecent)) {
      mostRecent = latestSnap.snapshot_date;
    }
  }

  // ---- Previous-month-end and 12-month series (snapshot-based) ----
  const now = new Date();
  const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevMonthEnd = monthEnd(prevMonthYear, prevMonth);
  const prevTotal = netWorthAt(prevMonthEnd, snapshotsByAccount, activeIds);

  const monthly: Array<{ month_end: string; total: number }> = [];
  for (let i = 11; i >= 0; i -= 1) {
    const t = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const me = monthEnd(t.getFullYear(), t.getMonth());
    monthly.push({ month_end: me, total: netWorthAt(me, snapshotsByAccount, activeIds) });
  }

  return {
    current: { total, liquid, invested, as_of: mostRecent },
    previous_month: { as_of: prevMonthEnd, total: prevTotal, delta: total - prevTotal },
    monthly,
    by_account,
  };
}
