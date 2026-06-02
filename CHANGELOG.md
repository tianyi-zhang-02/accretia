# Changelog

Notable changes to **tracker**. Loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project doesn't ship a versioned package — entries are grouped by milestone and dated. The "Live" line at the top of each section names the production URL after that milestone shipped.

## [Unreleased]

_Phase 3: documentation + self-hosting. README rewrite, SELF_HOSTING_GUIDE,_
_CHANGELOG, migration apply-order README, "every PR updates its docs" rule._

## Public Wealth Simulator — 2026-06-02 _(PR #7, merge `02542b7`)_

- **Added** `/sim`: a public, no-login Wealth Projection Simulator. Anyone can
  open the URL and run the full v2 simulator (assumptions form, role library,
  lifestyle creep, goal-seek, chart, year table, compare) entirely
  client-side. Nothing is saved to the server; "save" is replaced by an
  in-browser JSON download.
- **Architecture** Shared simulator UI components extracted from
  `src/app/(app)/simulator/` to `src/components/simulator/` so the public
  client can import them without touching auth chrome. `CompareView` type
  narrowed from server-row `Scenario` to `ComparableScenario`
  (`{id, name, assumptions}`).
- **Security (the wall)** Public route has zero forbidden imports
  (`supabase`, `env.server`, `/derived/`, `@/app/api/`, etc.) — verified
  by recursive import-graph audit. Proxy allowlist is exact-match. CSP
  still strict — page uses `await connection()` to force dynamic render
  so the per-request nonce is applied to every script.

## Simulator v2 — 2026-05-31 _(PR #5, merge `344e3e5`)_

- **Added** Searchable career role library (10 legal + 11 SWE/MLE roles)
  per career stage. Each role fills `baseSalary` / `annualRaisePct` /
  `bonusPct`; everything stays editable. Labeled "starting estimates,
  not market data."
- **Added** Lifestyle creep modeling. Two opt-in modes on `assumptions.lifestyle`:
  - `flat`: `expenses_i = base × (1+infl)^(i+1) × (1+creep)^(i+1)`
  - `incomeScaled`: absorbs `creepShareOfRaisePct` % of each after-tax
    raise into the next year's expense baseline; pay cuts clamped
    (sticky-downward).
  Composes with the savings-rate cap — never double-counts. Documented as
  engine assumption #6a.
- **Added** Goal-seek mode. User sets `target = { amount, age }` and the
  simulator solves four levers by **bisection over the verified engine**
  (no closed-form): extra monthly contribution, return %, annual expenses,
  target age. Round-trip verification: every solved value, fed back into
  the engine, hits the target within $1k.
- **Fixed** `0`-prefill input bug across every numeric field. New
  `NumField` uses local string drafts + select-on-focus.
- **Fixed** `netWorthAtAge` linearly interpolates between adjacent year
  rows so the age lever returns a continuous fractional answer (caught
  via the demo verification — original tests silently passed on NaN).

## Polish phase — 2026-05-30 _(PR #1, merge `1dd518a`)_

- **Architecture** Canonical net-worth helper at `src/lib/derived/networth.ts` —
  **single source of truth** for the dashboard, accounts list total,
  `/api/networth`, simulator prefill, and goal progress. Snapshot-
  authoritative with live-holdings fill for brokerage/retirement/crypto
  accounts that have no snapshot. See `README.md` Architecture for the
  contract.
- **Added** Plus-menu bottom sheet for cross-feature creation
  (transaction / holding / account / snapshot). Deep-link entry points
  via `?add=1` on accounts and portfolio.
- **Added** Unified toast system (`src/components/ui/toast.tsx`) and shared
  money formatter (`src/lib/format/money.ts`).
- **Added** lucide-react icons across the bottom nav with warm-gold accent
  for the active tab.

## Step 14 — Deploy — 2026-05-31 _(PR #4 + #6)_

- **Deployed** to https://tracker-gamma-eight-14.vercel.app on Vercel.
  Zero-config Next 16 build (no `vercel.json`). One-project Supabase setup.
- **Added** `STEP_14_DEPLOY.md` operator runbook.

## Step 13 — Security hardening — 2026-05-31 _(PR #3, merge `b00538d`)_

- **Security** Per-request CSP nonce in `src/proxy.ts`:
  `script-src 'self' 'nonce-X' 'strict-dynamic'` (no `unsafe-inline`, no
  `unsafe-eval`). `style-src 'self' 'nonce-X'`. `style-src-attr 'unsafe-inline'`
  accepted as the documented narrow escape hatch for Recharts SVG +
  dynamic `style={...}` JSX.
- **Security** Static security headers in `next.config.ts`: HSTS
  (prod-only), X-Frame-Options DENY, X-Content-Type-Options nosniff,
  Referrer-Policy same-origin, Permissions-Policy lockdown.
- **Security** Migration `0002_revoke_rls_auto_enable_grants.sql`:
  revokes EXECUTE on `public.rls_auto_enable()` from PUBLIC/anon/
  authenticated, grants only to service_role. Closes Supabase Advisor
  warnings #1 and #2.
- **Security** `npm audit` to 0/0/0 via `postcss` override forcing
  Next's nested 8.4.31 to 8.5.15 (GHSA-qx2v-qp2m-jg93).
- **Audit pass** Origin checks on every mutating route (16/16); every
  `z.string()` bounded by `.max() / .length() / .uuid() / .email() / .regex()`.

## Step 12 — PWA polish — _(direct push pre-PR-workflow)_

- **Added** `manifest.ts` + `ImageResponse`-generated icons (32 / 180 /
  192 / 512) + hand-rolled service worker (`public/sw.js`). No new deps.
- iOS `apple-web-app` meta + `format-detection: telephone=no` so
  tabular figures don't become accidental tap targets.

## Step 11 — Export — _(pre-PR)_

- **Added** Export endpoints: `/api/export/transactions.csv`,
  `/api/export/holdings.csv`, `/api/export/backup.json`.
- **Added** Optional **client-side AES-GCM encryption** for the JSON
  backup. PBKDF2-SHA-256 with 600k iterations (OWASP 2023). Passphrase
  never leaves the browser; no server route involved in encryption.
  Matching decrypt-to-view flow on `/settings/export`.

## Step 10 — Wealth simulator — _(pre-PR)_

- **Added** Full household wealth simulator: scenarios CRUD, pure
  deterministic engine (`src/lib/simulator/engine.ts`) with documented
  end-of-year inflation convention, low/mid/high return bands, multi-
  person careers, windfalls, major expenses. Compare across saved
  scenarios. "Use my actual data" prefill.
- **Engine sign-off** 24 tests including three sanity cases (compounding,
  ordinary-annuity closed form, real-dollars hand-check) and two
  coherence proofs (windfall+expense same-year cancel; final-year
  expense uses same period count as net-worth column).

## Step 9 — Holdings + Alpha Vantage proxy — _(pre-PR)_

- **Added** Holdings CRUD scoped to brokerage/retirement/crypto accounts.
- **Added** `/api/quotes` server-only proxy: `requireUser` first → rate
  limit (60/hr per user) → validate symbols → restrict to symbols the
  caller owns → cache to `price_cache` table (1h TTL crypto / 1h
  market-hours equities / 24h otherwise) → fall back to stale cache on
  upstream rate-limit rather than failing.

## Step 8 — Savings goals — _(pre-PR)_

- **Added** Savings goals CRUD with progress bars, percent complete,
  projected completion dates, linked-account auto-progress.

## Step 7 — Snapshots + net worth chart — _(pre-PR)_

- **Added** Single + bulk month-end snapshots. `/api/networth`
  aggregator. 12-month Recharts line chart on the dashboard.
  `/accounts/:id` drill-down with snapshot history.

## Step 6 — Transactions CRUD — _(pre-PR)_

- **Added** Transactions API routes, filterable list, add/edit/delete
  form, categories autocomplete.

## Step 5 — Accounts CRUD — _(pre-PR)_

- **Added** Accounts API routes, list page, add/edit/archive form.

## Step 4 — Layout shell — _(pre-PR)_

- **Added** Fonts (IBM Plex Sans + Fraunces + Geist Mono), bottom nav,
  `(app)` route group, placeholder section pages.

## Step 3 — Auth — _(pre-PR)_

- **Added** Magic-link auth (Supabase email OTP). 8-digit code flow.
  Proxy allowlists `/api/auth/send-otp` and `/api/auth/verify-otp`.
- **Fixed** Stage-2 sign-in `handleSubmit` silent failure — client-only
  token-shape schema so the empty email field doesn't fail zod
  validation invisibly.

## Step 2 — Schema — _(pre-PR)_

- **Added** `supabase/schema.sql` — accounts, transactions,
  account_snapshots, savings_goals, holdings, price_cache, user_settings.
  RLS on every user table; `auth.uid() = user_id` policy.

## Step 1 — Repo init — _(pre-PR)_

- Next.js 16 App Router scaffold, TypeScript strict, Tailwind v4, npm.

[Unreleased]: https://github.com/tianyi-zhang-02/tracker/compare/02542b7...HEAD
