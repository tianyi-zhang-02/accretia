# Changelog

Notable changes to **Accretia**. Loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project doesn't ship a versioned package — entries are grouped by milestone and dated. The "Live" line at the top of each section names the production URL after that milestone shipped.

## [Unreleased]

### Role library — bilingual + medicine & finance tracks

- **Added** Chinese titles + notes to **every** role (the picker shows them
  in `?lang=zh`, and search matches EN + 中文), plus two new tracks:
  **医疗 / Medicine** (13 roles: resident → NP/PA → primary care →
  specialists incl. anesthesiology, radiology, surgery, orthopedics,
  cardiology; base + productivity bonus, no equity) and **金融 / 咨询
  (Finance / Consulting)** (IB analyst/associate/VP, PE associate, hedge-fund
  analyst, quant, MBB consultant; cash-bonus-heavy, PE carry noted as not
  modeled). Also added Product Manager and Data Scientist (mid/senior) to the
  tech track.
- **Note** these are hand-curated **static** illustrative figures
  (levels.fyi / Medscape-style aggregates), not fetched live — the app makes
  no network calls. Every number stays editable; "last reviewed 2026-07".

### Native bilingual — English / 简体中文

- **Added** full native Chinese (简体中文) support, built bilingual from the
  start so the copy reads as _written_, not translated (净资产 / 复利 /
  税后收入 / 隐含储蓄率 / 目标求解 …). An `EN · 中文` switch sits in the
  header, and there is now a Chinese README (`README.zh-CN.md`) linked from
  the English one.
- **Changed** the active language lives in the `?lang=zh` URL param —
  shareable and refresh-safe with **no storage** (consistent with the app's
  no-storage rule); the browser language is auto-detected on first load
  (`useSyncExternalStore`, SSR-safe). Currency stays USD (presets are
  US-based; zh renders `US$…` and chart axes use 万/亿 via `Intl`).
- **Added** `src/lib/i18n/` — a typed EN/ZH message catalog (`Messages` is
  derived from `en`, so a missing zh key is a compile error) + locale-aware
  `Intl` formatters, plus `components/i18n/lang-switch.tsx`. Every
  interactive surface (assumptions form, goal-seek, tables, compare, chart)
  is translated. Role titles / US state names stay as library data in
  English (Chinese tech usage commonly keeps these untranslated).

### Renamed to Accretia

- **Changed** the project/repo name to **Accretia** — from _accretion_,
  growth by gradual accumulation (the essence of compounding), and picked
  to be distinctive rather than collide with the many "wealth trackers" /
  "wealth simulators" out there. GitHub repo renamed `tracker` →
  `accretia` (old URLs auto-redirect); updated `package.json` name, the
  PWA manifest (`name`/`short_name` → "Accretia"), the page + browser-tab
  titles, the visible `<h1>`, README, CLAUDE.md, and this file's compare
  link. The Vercel project + live URL keep their existing names.

### Comp model: equity, derived savings, tax presets

- **Changed** the cash-flow model to **derived savings**: removed the
  `annualSavingsRatePct` input; each year `saved = after-tax income −
  spending`. Can go negative (drawdown). The implied savings rate is now
  shown as an OUTPUT in the projection panel. Engine assumption #6/#6a
  rewritten; tests re-verified with new hand-computed cases. (Imported
  JSON that still carries `annualSavingsRatePct` is accepted and the
  value ignored — zod strips it.)
- **Added** equity / RSU compensation: `careerStage.annualEquity`
  (optional) is added flat to gross income each year of the stage and
  taxed like salary (RSUs vest as W-2 income). Every role preset now
  carries a realistic equity figure — for big-tech / frontier-AI roles
  it's the largest component. Career-preset SWE/EM stages updated too.
  New "Equity / RSU per year" field on each career stage.
- **Added** `tax-presets.ts` — a rough state (50 + DC) + federal
  effective-rate lookup with a `TAX_LAST_REVIEWED` date. New Taxes-section
  helper: pick a state + income → estimated combined effective rate →
  Apply (then fine-tune). Clearly labeled illustrative, not tax advice.
- **Changed** the role picker from search-only to a **browsable list
  grouped by track** (Legal · Software/ML) with search on top; role lines
  now show equity alongside base/bonus/raise.
- **Changed** the default scenario now seeds one earner (SWE with equity)
  so the first-load projection is illustrative rather than an all-drawdown
  line.

### Live side-by-side editor

- **Changed** the simulator from a three-tab layout to a **live side-by-side
  editor**: assumptions on the left, the projection (final balance + chart +
  goal-seek) pinned (`sticky`) on the right, so editing an assumption updates
  the chart in real time. On mobile it stacks — projection on top, assumptions
  below.
- **Changed** Compare is now a toggle in the scenario bar (swaps the editor
  for the compare view) instead of a third tab.
- **Changed** page container widened to `max-w-6xl` to fit the two columns;
  the year-by-year table sits full-width below the split.

### Stripped to a client-only simulator

The project is now **purely a client-side wealth-projection simulator** —
no backend, no database, no auth, and nothing stored or cached anywhere.
The owner moved day-to-day tracking to a real brokerage and wanted just
the projection tool.

- **Removed** all tracking, auth, and backend: accounts, transactions,
  snapshots, savings goals, holdings, portfolio, tax-lots, dashboard,
  magic-link auth, every `/api/*` route, the entire Supabase layer
  (schema, migrations, clients), the Alpha Vantage quote proxy + price
  cache, and all related validation / types / helpers. (Preserved in
  git history.)
- **Removed** all environment variables — the app needs none.
- **Changed** the app is now a single page (`/`) rendering the
  simulator entirely client-side. Scenarios live in memory; a refresh
  resets. Persistence is manual **Export / Import** of a scenario as a
  JSON file (imports validated against the engine's Zod schema).
- **Added** JSON **import** (export already existed) and a cleaner
  three-tab layout — **Projection · Assumptions · Compare** — with a
  scenario bar on top.
- **Changed** `src/proxy.ts` down to CSP-nonce only (no Supabase /
  session / auth). Strict CSP retained; `connect-src` is now `'self'`
  since the app makes no network calls.
- **Removed** dependencies: `@supabase/ssr`, `@supabase/supabase-js`,
  `@hookform/resolvers`, `react-hook-form`, `lucide-react`,
  `server-only`, and the `@electric-sql/pglite` devDep. Runtime deps
  are now just `next`, `react`, `react-dom`, `recharts`, `zod`.
- **Removed** now-obsolete docs (self-hosting guide, deploy runbook,
  spec files, data-model architecture doc). README + CLAUDE.md
  rewritten for the client-only app. `npm audit`: 0 vulnerabilities.

### Projection-first re-focus

The app is now projection-first: the wealth simulator is the home screen,
and manual tracking (accounts, portfolio, transactions, snapshots, goals)
is secondary — reachable via Settings but no longer in the primary nav —
now that a real brokerage handles day-to-day tracking. **Nothing was
deleted and there are no DB changes; this is a reversible re-focus.**

- **Changed** Home `/` now renders the wealth-projection simulator (was
  the net-worth dashboard).
- **Changed** The net-worth dashboard moved to `/dashboard` (unchanged
  otherwise, still fully working).
- **Changed** `/simulator` now permanently redirects to `/` so old
  bookmarks / links keep working.
- **Changed** Bottom nav is projection-first:
  **Projection (`/`) · Dashboard (`/dashboard`) · [＋ new scenario] ·
  Compare (`/?view=compare`) · Settings**.
- **Added** Deep-link entry points on the simulator: `/?new=1` starts a
  fresh scenario (the "+" button), `/?view=compare` opens directly into
  the compare view.
- **Changed** The "+" sheet's primary action is now "New projection
  scenario"; the tracking shortcuts (add transaction / holding / account,
  update balances) remain under a muted "Tracking (optional)" subheader.
- **Changed** Settings gained a "Tracking (optional)" section linking the
  dashboard, accounts, portfolio, transactions, goals, and bulk-balance
  update — so nothing is orphaned by leaving the primary nav.
- **Changed** README Features reframed projection-first.

### Migration test harness — pglite

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

[Unreleased]: https://github.com/tianyi-zhang-02/accretia/compare/02542b7...HEAD
