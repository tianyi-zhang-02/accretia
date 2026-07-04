# Architecture

The structural pieces worth knowing before reading code. Read [`CLAUDE.md`](./CLAUDE.md) for the security and contribution rules; this file describes how the bits fit together.

## High-level shape

```
┌───────────────────────────────────────────────────────────────┐
│ Browser (private app)              Browser (public /sim)      │
│  ───────────────────                ──────────────────         │
│  React + Tailwind                   React + Tailwind           │
│  fetch → /api/* only                no fetch                   │
└────────┬──────────────────────────────────────────────────────┘
         │                                       │
         │ HTTPS + auth cookie                   │ HTTPS, no cookie
         │                                       │
┌────────▼───────────────────────────────────────▼──────────────┐
│ Next.js 16 (App Router) on Vercel                              │
│   src/proxy.ts                                                 │
│     - per-request CSP nonce                                    │
│     - PUBLIC_PATHS allowlist (exact match)                     │
│     - Supabase session refresh                                 │
│   src/app/(app)/*       authed pages                           │
│   src/app/api/*         authed JSON API                        │
│   src/app/sim/*         public, no DB / no auth                │
│   src/lib/supabase/*    server-side Supabase client            │
│   src/lib/derived/*     canonical computations                 │
│   src/lib/quotes/*      Alpha Vantage proxy + cache            │
│   src/lib/simulator/*   pure simulation engine                 │
└────────┬───────────────────────────────────────────────────────┘
         │  postgres-rest (SSR client)
┌────────▼───────────────────────────────────────────────────────┐
│ Supabase                                                       │
│   Postgres, RLS on every user table                            │
│   Auth (magic-link / OTP)                                      │
└────────────────────────────────────────────────────────────────┘
         │
         │ outbound, server-side only
         ▼
   Alpha Vantage (quote provider, free tier)
```

Browsers never call Supabase or Alpha Vantage directly. Every cross-process boundary that touches user data has a Next.js API route in front of it.

## Data model

All tables live in the `public` schema. Every user table:

- Has a `user_id uuid not null references auth.users(id) on delete cascade` column.
- Has Row Level Security enabled.
- Has exactly one RLS policy: `using (auth.uid() = user_id) with check (auth.uid() = user_id)`.

The exception is [`price_cache`](#price_cache) — RLS is enabled but with **no policies** so only the service-role key can read or write it.

### User-owned tables

| Table | Purpose | Key fields | RLS |
|---|---|---|---|
| `accounts` | User-defined accounts (cash / savings / brokerage / retirement / crypto / other). One row per logical account. | `name`, `type`, `currency`, `archived_at` | `user_id` |
| `transactions` | Income, expenses, savings deposits and withdrawals attached to an account. | `account_id`, `kind`, `amount`, `category`, `occurred_on`, `note` | `user_id` |
| `account_snapshots` | Point-in-time balance for one account on one date. The user enters these manually (single or bulk month-end form). Drives the historical net-worth chart. | `account_id`, `balance`, `snapshot_date` | `user_id` |
| `savings_goals` | Named targets with monthly contributions and optional linked accounts. | `name`, `target_amount`, `target_date`, `monthly_contribution`, `linked_account_id` | `user_id` |
| `holdings` | One row per (account, symbol) for brokerage / retirement / crypto. Total `quantity` and `cost_basis` are the **sum of the holding's lots** (see [`holding_lots`](#holding_lots) below). | `account_id`, `symbol`, `asset_type`, `quantity`, `cost_basis` | `user_id` |
| `holding_lots` | Per-acquisition lots that roll up into a holding. Each lot has its own `acquired_on` date which drives long-term vs short-term tax classification. | `holding_id`, `quantity`, `cost_basis`, `acquired_on`, `acquired_on_estimated` | `user_id` |
| `user_settings` | Per-user preferences (default currency, inflation assumption, etc.). One row per user. | `default_currency`, etc. | `user_id` |
| `scenarios` | Saved wealth-simulator scenarios. `assumptions` is a `jsonb` blob validated with the same zod schema the engine reads. | `name`, `assumptions` (jsonb) | `user_id` |

### Server-only tables

| Table | Purpose | Access |
|---|---|---|
| `price_cache` | Cached Alpha Vantage quote responses, keyed by symbol. TTL: 1h for crypto, 1h for equities during US market hours (Mon–Fri 13:30–21:00 UTC), 24h outside market hours. | service-role key only (RLS enabled, no policies) |

### Holdings ↔ holding_lots — the lot accounting invariant

Phase 4 introduced `holding_lots` so a single holding can be sliced into multiple acquisition events (each with its own date) for tax-classification purposes. The invariant that keeps reads consistent and migrations safe:

> **For every holding `h`:**
> `sum(lot.quantity)   = h.quantity`
> `sum(lot.cost_basis) = h.cost_basis`
> **to the cent.**

The 0003 migration enforces this invariant at apply time — it RAISES and rolls back the entire transaction if any holding's lot sums don't match. The application maintains the invariant going forward (work for the next phase): when the user adds, edits, or removes a lot, the parent holding's totals must be updated in the same transaction.

For all current reads (portfolio value, dashboard net worth via [`computeNetWorth`](#canonical-net-worth-helper), CSV export), the existing `holdings.quantity` and `holdings.cost_basis` columns are authoritative. Lot data is purely additive — nothing breaks if the application is unaware of lots.

#### Classification contract — `acquired_on_estimated`

Backfilled lots have `acquired_on = holdings.created_at::date` and `acquired_on_estimated = true`. The date is when the holding was first added to *tracker*, **not** the real acquisition date. For users who set up the app recently it's effectively "today," and using it as the input to long-term vs short-term classification would mislabel every existing position as short-term.

The contract (enforced via SQL `comment on column` so it travels with the DB, and documented in the migration source):

1. **Long-term / short-term classification MUST first check `acquired_on_estimated`.** When `true`:
   - Do not compute LT/ST from `acquired_on`.
   - Render the lot as "acquisition date needs review" with a CTA to set a real date.
   - Do not include the lot in any aggregate tax-impact estimate (LT vs ST gains, hypothetical-sale tax) until the user replaces the estimated date with a real one.
2. **Lots with `acquired_on_estimated = false`** are user-confirmed and may participate in classification + tax estimates per the 365-day rule.
3. **Editing a lot's `acquired_on` in the UI MUST also set `acquired_on_estimated = false`** in the same write. The flag is only `true` on rows the user has never reviewed.

The Phase 4 follow-up PR that builds the classification UI / tax estimate MUST honor this contract — the next reviewer should reject the PR if it doesn't.

## Canonical derivations

Two helpers live under `src/lib/derived/`. Both are `'server-only'`. **They are the only correct way to compute the values they own.** Don't recompute net worth or baseline cashflow inline in a route — call these.

### Canonical net-worth helper — `src/lib/derived/networth.ts`

`computeNetWorth(supabase, userId)` returns the dashboard hero number, the accounts-list total, the per-account breakdown with source-of-value annotation, and the 12-month historical series for the chart. Called by:

- `/api/networth` (dashboard, simulator prefill, goal progress)
- Server components that need a balance figure directly without an HTTP round-trip

Holdings → net-worth model (decided during polish §1):

- **Brokerage / retirement / crypto WITH a snapshot for any date:** the latest snapshot wins. Holdings are informational on the portfolio page only.
- **Brokerage / retirement / crypto WITHOUT a snapshot but WITH holdings:** balance = `sum(quantity × live price)`. On Alpha Vantage failure (rate-limited, unknown symbol), falls back to `cost_basis` for that holding so the account isn't silently zeroed.
- **Cash / savings / other:** snapshot wins, with 0 fallback.

The per-account `source` field (`'snapshot' | 'holdings' | 'none'`) tells the UI which path was used.

### Canonical cashflow helper — `src/lib/derived/cashflow.ts`

Sibling helper. Aggregates the user's transaction history into trailing baseline expenses + savings rate + months observed. Powers the simulator's "Use my actual data" prefill.

## Other significant modules

### Pure simulation engine — `src/lib/simulator/engine.ts`

`simulate(assumptions)` is a deterministic pure function returning year-by-year rows. No I/O, no DB. Documented end-of-year inflation convention (row `i` values are nominal at T=i+1), eight enumerated simplifying assumptions, lifestyle-creep modes that compose with the savings-rate cap without double-counting (assumption #6a). 54 tests across `engine.test.ts` + `goalSeek.test.ts` + `scenarios-demo.test.ts` + `simulator-v2-demo.test.ts`.

The pure-function design is what lets [`/sim`](#public-simulator-) reuse the engine without importing any data layer.

### Goal-seek solver — `src/lib/simulator/goalSeek.ts`

Bisection-over-the-engine. Reuses the verified engine instead of deriving closed-form formulas. Solves four levers independently: extra monthly contribution, return %, annual expenses, target age. Round-trip verification in `goalSeek.test.ts` confirms that every solved value, fed back into the engine, hits the target within $1k.

### Alpha Vantage proxy + cache — `src/lib/quotes/`

`alphavantage.ts` is the upstream client. `cache.ts` reads/writes `price_cache` with the TTL policy described above. Both are `'server-only'`. The browser never sees the API key — it hits `/api/quotes` and the server enforces auth, restricts requested symbols to ones the user owns, rate-limits per user (60/hr), and proxies.

### Proxy (Next.js 16 middleware) — `src/proxy.ts`

Per-request CSP nonce generation, public-path allowlist (`PUBLIC_PATHS` — **exact match only**), Supabase session refresh. The exact-match invariant matters: widening to a prefix like `/sim/` would silently auto-public any future `/sim/something-private` subpath.

### Public simulator — `src/app/sim/`

Mirrors the authed `/simulator` UI but with all data wiring stripped. No `fetch()` to any `/api/*` route. No Supabase imports. Saves are replaced by an in-browser JSON download. Shares the simulator UI components from `src/components/simulator/` with the authed twin (the components themselves are data-free; data wiring is in the route-level clients only).

Verified during PR #7: recursive import-graph audit, exact-match proxy allowlist, no `fetch()` calls in source or rendered HTML, CSP nonce coverage 17/17.

## What lives where

```
src/
  app/
    (auth)/login/           magic-link sign in
    (app)/                  authed pages (bottom nav, session refresh)
      page.tsx              HOME = wealth projection simulator
      dashboard/            net-worth dashboard (was home; now secondary)
      simulator/            redirects to / (kept for old links)
      accounts/, transactions/, portfolio/, goals/, ...  (tracking, via Settings)
      api/                  authed JSON API
    sim/                    PUBLIC simulator, walled off from data
    auth/confirm/           magic-link click target
    layout.tsx              root layout (fonts + globals.css)
    proxy.ts                CSP + allowlist + session refresh
  lib/
    supabase/{server,proxy}.ts    SSR Supabase clients (server-only)
    derived/{networth,cashflow}.ts canonical computations (server-only)
    quotes/{alphavantage,cache}.ts Alpha Vantage proxy (server-only)
    simulator/{engine,goalSeek,career-presets,rolePresets}.ts pure math + presets
    validation/                   zod schemas, one per resource
    env.ts, env.server.ts         env-var access
  components/
    charts/, simulator/, ui/, layout/, pwa/
  ...
supabase/
  schema.sql                fresh-setup consolidated schema
  migrations/               numbered forward-only migrations
```
