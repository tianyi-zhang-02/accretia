# Changelog

Notable changes to **tracker**. Loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project doesn't ship a versioned package — entries are grouped by milestone and dated. The "Live" line at the top of each section names the production URL after that milestone shipped.

## [Unreleased]

### Phase 4 part 2 — tax lots UI + classification + tax estimates _(parked, PR #11)_

> Built and reviewed but intentionally unmerged. The owner has no
> holdings to validate the feature against yet; will merge when
> actual tax-lot tracking starts. **Migration 0004 has NOT been
> applied to the prod DB.** See CLAUDE.md § Parked / unmerged work.

- **Added** migration `0004_user_settings_tax_rates.sql` — additive
  columns `effective_lt_tax_rate_pct` and `effective_st_tax_rate_pct` on
  `public.user_settings`. Both default to 0; UI hides tax estimates
  until both are positive. CHECK constraint 0–80 covers any realistic
  combined federal+state+NIIT bracket. Safe on populated DBs: existing
  rows just inherit the defaults.
- **Added** lot CRUD endpoints:
  - `GET  /api/holdings/[id]/lots`           — list lots for a holding
  - `POST /api/holdings/[id]/lots`           — create a lot
  - `PATCH /api/holdings/[id]/lots/[lotId]`  — edit a lot
  - `DELETE /api/holdings/[id]/lots/[lotId]` — remove a lot (refuses to
    remove the last lot of a holding so the invariant stays intact)
- **Added** user-settings API:
  - `GET   /api/user-settings` (lazy-creates the row on first read)
  - `PATCH /api/user-settings` (upsert + readback)
- **Added** `src/lib/holdings/sync-totals.ts` — the canonical helper
  every lot-mutating code path calls to recompute
  `holdings.quantity = sum(lots.quantity)` and
  `holdings.cost_basis = sum(lots.cost_basis)` in scaled-integer
  arithmetic, preserving the invariant exactly without floating-point
  drift over many edits.
- **Added** `src/lib/derived/lots.ts` — pure classification +
  hypothetical-sale-estimate helpers. **Honors the migration-0003
  classification contract**: `acquired_on_estimated = true` lots
  always classify as `needs_review` (regardless of date) and never
  receive a tax estimate. 14 unit tests covering the contract, the
  365-day exclusive boundary, rounding to the cent, loss/zero-gain
  handling, and the "rate=0 → no estimate" rule.
- **Changed** `POST /api/holdings` now also inserts the initial lot —
  default `acquired_on = today` with `acquired_on_estimated = true`
  unless the caller explicitly supplied a real date. Preserves the
  invariant from day one for new holdings.
- **Changed** `PATCH /api/holdings/[id]` — if the request changes
  `quantity` or `cost_basis`:
  - On a single-lot holding: mirrors the change onto the lot AND the
    holding in the same request, then resyncs from sum(lots) as a
    defensive check.
  - On a multi-lot holding: returns 409 `multi_lot_holding_use_lot_endpoints`
    so the user is directed to the lot-level UI.
- **Added** Settings → Tax-estimate rates form. Two inputs (LT %, ST %).
  Surfaces the "estimate only, not tax advice" disclaimer and the list
  of unmodeled factors (wash sales, lot-selection methods, state
  surtaxes beyond the blended rate, NIIT thresholds).
- **Added** Portfolio holding rows get a "Lots" toggle. Expanding
  shows per-lot classification badge (Long-term / Short-term / Needs
  review), acquired date with "estimated" indicator, market value,
  unrealized gain, and (when both rates are set) the per-lot tax
  estimate. "Needs review" lots get an inline date picker CTA — saving
  the date implicitly clears the estimated flag and triggers
  classification.
- **Added** `apiError.conflict(message)` for the multi-lot-holding
  case. Joins the standing pattern of generic, hostile-reader-safe
  error responses in `src/lib/api-error.ts`.

### Migration test harness — pglite (PR #10, merged)

- **Added** `@electric-sql/pglite` as a devDep — Postgres compiled to WASM,
  ~3MB. Lets us run migration safety checks against real Postgres
  semantics in CI / locally without needing a Postgres daemon or Docker.
- **Added** `supabase/migrations/0003_holding_lots.rollback-test.mjs` —
  pins the four rollback verification cases that were run by hand during
  PR #9 review (GOOD case + three BAD cases including the 1e-8 precision
  boundary). Run with `npm run test:migrations`. Exits non-zero if any
  case behaves unexpectedly.
- **Added** `npm run test:migrations` script.
- **Convention**: future migrations that ship a safety check should
  include a sibling `NNNN_xxx.rollback-test.mjs` and extend the
  `test:migrations` script (or chain via `&&`) to invoke it. Documented
  in `supabase/migrations/README.md`.

### Phase 4 — tax lots (data model only)

- **Added** `public.holding_lots` table. One acquisition-event per row,
  rolling up into a holding. Columns: `quantity`, `cost_basis`,
  `acquired_on`, `acquired_on_estimated`. RLS on, owner-only policy
  (`auth.uid() = user_id`). Indexes on `user_id` and `holding_id`.
- **Added** classification contract for `acquired_on_estimated`:
  pinned into the database catalog via `comment on column` (so it
  travels with the schema), documented in the migration source, and
  expanded in `ARCHITECTURE.md` § Classification contract. Short
  version: classification code MUST check the flag first and treat
  estimated-date lots as "needs review" rather than feeding the
  placeholder date into the 365-day LT/ST cutoff.
- **Added** migration `0003_holding_lots.sql`. Additive and
  forward-only:
  - Wraps the entire migration in an explicit `begin; ... commit;` so
    self-hosters never end up in a half-applied state.
  - Backfills one lot per existing holding mirroring `quantity` and
    `cost_basis` to the cent, with `acquired_on = created_at::date` and
    `acquired_on_estimated = true` so the UI can render the date as a
    placeholder until the user supplies a real acquisition date.
  - Idempotent — re-running skips holdings that already have at least
    one lot.
  - Transactional safety check at the end: RAISES and rolls back the
    entire transaction if any holding's lot sums don't equal the
    holding total to the cent.
- **Added** `supabase/migrations/0003_holding_lots.test.ts` — JS-level
  verification of the backfill mapping with a fixture covering integer
  shares, fractional DRIP shares, 8-decimal crypto, zero-quantity
  closed positions, and zero-cost-basis gifts. Demo block prints
  before/after portfolio totals to the cent.
- **Added** `ARCHITECTURE.md` — full data-model reference (every table +
  RLS pattern + holdings ↔ holding_lots invariant) and module map.
  Linked from README.
- **Changed** `supabase/schema.sql` includes the `holding_lots` table
  inline so a fresh installation gets it without applying 0003 — the
  migration file is for upgrade paths only.
- **Changed** `supabase/migrations/README.md` documents 0003: what it
  adds, the backup-before-apply requirement, and the transactional
  safety check.

### Phase 3 — documentation + self-hosting (PR #8)

- **Added** `SELF_HOSTING_GUIDE.md` — dogfooded fork-and-deploy walkthrough,
  including the `?type=email` magic-link URL fix (`/auth/confirm` rejects
  links without it) and a Resend SMTP setup section (Supabase's default
  sender is dev-only and silently breaks deliverability in production).
- **Added** `CHANGELOG.md` (this file) — milestone-grouped, backfilled.
- **Added** `supabase/migrations/README.md` — apply-order + rules.
- **Added** `README.md` Architecture section documenting
  `src/lib/derived/networth.ts` as the single source of truth for every
  net-worth surface.
- **Added** `CLAUDE.md` "Every PR Updates Its Own Docs" rule — every
  behavior-changing PR must update CHANGELOG, README, .env.example,
  SELF_HOSTING_GUIDE, migrations docs, and spec files in the same PR.
- **Added** `husky` + `.husky/pre-commit` running `gitleaks` against
  staged changes. Prints a friendly install hint and exits 0 if
  gitleaks isn't installed locally (opinionated trade-off — don't
  block unrelated commits just because a dev hasn't set up the tool
  yet). Bypass for legitimate edge cases: `git commit --no-verify`.
- **Added** `package.json` `engines.node = ">=20.19"` — enforces the
  Node version `prettier-plugin-tailwindcss` already requires.
- **Removed** false claim in the previous README that gitleaks
  pre-commit was already wired up. As of this PR, it actually is.
- **Security note (not a code change in this PR):** vitest advisory
  [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp)
  affects `vitest < 4.1.0` only when the `vitest --ui` server is
  listening. This project runs `vitest run` (one-shot) and never starts
  the UI server — not exploitable in this codebase. Logged in CLAUDE.md
  Known security debt #4 with the assessment for future re-evaluation.

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
