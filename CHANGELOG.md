# Changelog

Notable changes to **Accretia**. Loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project doesn't ship a versioned package — entries are grouped by milestone and dated. The "Live" line at the top of each section names the production URL after that milestone shipped.

## [Unreleased]

### Pixel world: FIRE celebration, endless summer, a real sea

- **Added** reaching FIRE now throws a party past that year: a **rainbow**
  arcs over the FIRE house 🌈, **confetti** drifts down (melting at the
  ground), and **fireworks** pop on a loop 🎆.
- **Changed** the world is now in **permanent daytime** — a fixed sun and
  drifting clouds; no more night cycle, stars, or moon (job-loss overcast
  and crash rain still darken their stretch).
- **Fixed** the seaside scene: the tiny floating puddle became a **proper
  sea** — a waterline submerges the terrain's lowest ~28 columns (the
  journey starts at the shore), with animated glints and the sailboat
  anchored mid-water.
- All pixel art is original and drawn procedurally in-repo.

### Retirement realism — people can finally retire

Modeled on full-featured retirement calculators (à la Financial Mentor's
"Ultimate Retirement Calculator"). Previously career income ran to the
horizon end — nobody could retire.

- **Added** a per-person **retire age** (career income stops; absent = the
  old behavior). The projection immediately reflects the earning-years vs
  drawdown-years split, and the pixel journey plants a **deck chair** on the
  retirement year.
- **Added** a **Retirement & other income** section: retirement spending as
  a % of the working baseline (spending usually drops), an optional
  **post-retirement return** (the low–high band keeps its spread), and
  unlimited **income streams** — social security, pensions, rental,
  annuities — each with start/end age, inflation-adjusted (default, like
  CPI-indexed social security) or fixed-nominal, taxed like all income.
- All opt-in — 97 tests, zero regressions.

### Pixel polish

- **Fixed** snowflakes now melt when they reach the ground (never drawn
  below the terrain — the white terrain top reads as snowpack), and larger
  flakes are little ❄-style crosses instead of square dots.

### Opt-in "Save on this device"

- **Added** a **Save on this device** toggle in the scenario bar — tick it
  and your scenarios live in this browser's `localStorage` (single key,
  `accretia:saved:v1`), restored on the next visit so you can continue
  planning. **Default OFF: nothing is stored and a refresh still starts
  clean**, exactly as before. Data stays on your device — still nothing is
  ever sent anywhere; restored data is validated against the schema like
  any untrusted input, and unticking erases the key immediately. Bilingual.
  Privacy copy in both READMEs and the CLAUDE.md rule updated to match.

### Pixel world 2.0 — categories, tiered houses, scenes, stress weather

- **Added** an optional **category** on major expenses (car / home (second
  property) / boat / travel / other). The engine ignores it; the pixel world
  places matching sprites: a little car, a **second house sized by price**
  (~$1M bungalow · ~$3M two-story · $5M+ mansion — the financed first home
  from the mortgage block is tiered the same way), a yacht bobbing on its
  own water, and a suitcase — with a **plane crossing the sky** (contrail
  included) whenever any travel is planned.
- **Added** three switchable **scenes** (palette reskins): Meadow ·
  Seaside (sand palette + a sailboat anchored in a bay at the terrain's
  lowest point) · Snow (white ground + falling snow).
- **Added** stress automation: a **job-loss window now darkens the sky** —
  an overcast band with parked grey clouds over the affected years (a
  market-crash year already rains). Configured tools flow into the world
  automatically. 91 tests.

### Pixel journey — the projection as a tiny living world

- **Added** a **Pixel journey** strip above the chart: the
  terrain follows your real (today's-dollar) net worth, and your milestones
  appear as pixel landmarks — Coast FIRE beach umbrella, Lean-FIRE tent,
  Full-FIRE house with a gold flag, goal flag, home purchase, windfall
  chests, expense signposts, and a storm cloud raining on a market-crash
  year. A little walker crosses the horizon under a sun–moon cycle (gold
  scarf + sparkles once past FIRE), trailed by a cat. Hover any year for
  the number; hide it with one click.
- **Zero dependencies** — procedural `<canvas>` (no images, no libraries),
  no network. Dark/light palettes, bilingual labels, static frame under
  `prefers-reduced-motion`. Purely decorative: same rows as the chart, with
  the layout logic pure and unit-tested (88 tests).

### Two-pool model: bills come first, only invested money compounds

- **Added** an **Invested share of surplus** input (Starting state, default
  100%; new scenarios seed 80%). Savings is still derived from after-tax
  income − spending, but only that share of a positive surplus goes into the
  **invested pool** — the rest stays as **cash**: it counts in net worth but
  earns nothing. Not everything you keep gets to eat the returns. Bilingual.
- **Fixed** `startingInvested` was collected and validated but **ignored** —
  the engine grew your entire starting net worth at the investment return.
  Now only the invested pool compounds; the gap sits as cash.
- **Fixed** FIRE milestones counted **home equity** toward the 25× number.
  They now use investable (ex-home) real net worth — you can't withdraw 4%
  of a house. Disclaimer updated.
- **Changed** shortfalls and housing costs draw **cash first**, then
  investments; a market-crash stress now hits only the invested pool (your
  checking account doesn't crash). With no mortgage, 100% share, and
  starting net worth fully invested, results are bit-identical to before
  (regression-tested; 82 tests).

### UI flow — findability and stickiness

- **Changed** the asset-mix calculator moved out of the global "advanced
  tools" toggle (which lives in the *other* column) into its own inline
  disclosure inside Investment & inflation — where returns are edited.
- **Fixed** the projection column no longer pins (`sticky`) while advanced
  tools are open — a pinned column taller than the viewport made its lower
  panels unreachable.
- **Fixed** header controls wrap on narrow screens.

- **Docs** — refreshed README (EN + 中文) for the full v1.0.0 feature set
  (FIRE, Monte Carlo, stress test, mortgage, asset mix, themes) and added a
  release / license badge.

## [1.0.0] — 2026-07-07

First tagged release of **Accretia** — a complete, bilingual, fully
client-side wealth-projection simulator.

_Live: https://tracker-gamma-eight-14.vercel.app_

### More conservative default returns

- **Changed** the default return assumption from 7% (band 4–10) to a more
  cautious **6% nominal (band 3–9)** — ≈ 3% real at 3% inflation — after
  feedback that the projection looked over-optimistic. Only the seed default
  changed; existing/imported scenarios and the engine are untouched.

### Home & mortgage what-if

- **Added** a bilingual (EN / 中文) **Home & mortgage** section. When enabled,
  net worth becomes **investable balance + (home value − mortgage balance)**:
  the down payment converts cash to equity; each year the mortgage payment
  splits into **interest** (a real cost) and **principal** (net-worth-neutral,
  cash → equity); **property tax** + maintenance are costs; the home
  **appreciates**. Inputs: purchase year, price, down %, rate, term, property
  tax %, maintenance %, appreciation %; shows the **monthly P&I** payment.
- **Engine**: the model is part of the main projection, so the chart, FIRE,
  Monte Carlo, and stress test all account for it. Additive — with no
  mortgage, net worth is **exactly** as before (regression-tested). 75 tests
  total.

### Display preferences — font size + light theme

- **Added** header controls: **A− / A+** to zoom the whole page, and a
  **☀ / ☾** toggle for a **light theme** (warm off-white with darker
  accent/positive/negative for contrast). Both are in-memory preferences
  (reset on refresh, per the no-storage rule) — theme via
  `<html data-theme>`, zoom via the page `zoom`. Bilingual labels.

### Less clutter — collapse set-once form sections

- **Changed** the Horizon and Taxes sections to collapsed by default (they're
  usually set once). The form now opens with just the three you actually
  tweak — Starting state, Investment & inflation, and People & careers — with
  the rest one click away.

### Monte Carlo — deterministic ⇄ probabilistic switch

- **Added** a **Deterministic / Probabilistic** switch on the projection
  chart. Probabilistic mode runs 1,000 seeded random market paths on your
  assumptions (a **Volatility** input, default 15%) and draws a
  **p10 / p50 / p90** fan; with a goal-seek target set, it also shows your
  **success probability** ("82% chance of hitting your goal"). Real,
  today's-dollar basis. Bilingual (EN / 中文).
- **Engine**: additive only — a pure `runMonteCarlo` layer reuses the exact
  cash-flow math via an optional per-year return sampler on
  `simulateScenario`; `simulate()` and every existing call are unchanged.
  Seeded, so the bands don't flicker. **Regression-tested: volatility 0
  reproduces the deterministic projection exactly.** 70 tests total.

### Simple by default — advanced tools collapsed

- **Changed** the projection to progressive disclosure: by default it shows
  just the essentials (inputs + chart + final balance). A **Show advanced
  tools** toggle reveals goal-seek, FIRE, the stress test, and the asset-mix
  calculator. Keeps first use simple without hiding the power. Bilingual
  (EN / 中文); the choice is in-memory (resets on refresh).

### Asset-mix return calculator

- **Added** a bilingual (EN / 中文) asset-allocation calculator in the
  Investment section: blend an expected return from a rough mix — stocks,
  high-yield savings (~3–4%), bonds, real estate — where each bucket's net
  return is its return **minus a carrying cost** (e.g. property tax on real
  estate). Shows the weight-normalized blended return and Applies it to the
  low–base–high return band. Transient like the tax estimator — illustrative,
  no engine or schema change. (Full per-year real-estate + property-tax
  modeling will come with the mortgage what-if.)

### Stress test — job loss + market crash what-ifs

- **Added** a bilingual (EN / 中文) Stress-test panel — a deterministic
  "what if it goes wrong" overlay. Model a **job loss** (a person's, or
  everyone's, income scales to a kept-% for N years) and/or a **market
  crash** (one year's return overridden, e.g. −37% for a 2008-style year),
  with one-click presets. Shows baseline-vs-stressed final net worth (delta
  + %) and the trough (lowest point + year). The main projection is
  unchanged — the engine applies the shocks only for this panel.
- **Engine**: `simulate(assumptions, stress?)` gains an optional stress
  overlay; existing `simulate(a)` calls are unaffected. New optional
  `stress` block in the scenario schema (rides in export/import). Covered by
  unit tests (66 total). First of the risk-modeling features (Monte-Carlo
  probabilistic version and mortgage what-if to follow).

### Removed Vercel Web Analytics

- **Removed** the `@vercel/analytics` package and the `<Analytics />` tracker
  that a Vercel "Enable Analytics" flow had auto-added (PR #26). It was the
  only tracking script in the project and it conflicts with the app's
  no-tracking / nothing-sent privacy stance. Runtime deps are back to just
  `next` / `react` / `react-dom` / `recharts` / `zod`; `npm audit` clean.
  (Analytics should also be turned off in the Vercel dashboard so it isn't
  re-added.)

### FIRE panel — the year work becomes optional

- **Added** a bilingual (EN / 中文) FIRE panel in the projection column. It
  **derives** — from the existing projection, no engine change — the first
  year your real (today's-dollar) net worth reaches your FIRE number
  (annual spend ÷ withdrawal rate; 25× at 4%). Shows **Full FIRE**, **Lean
  FIRE** (via a separate essential-spend input, for needs-vs-wants), and
  **Coast FIRE** (the year you can stop saving and let compounding reach Full
  FIRE by 65).
- **Added** inputs: safe-withdrawal-rate (default 4%), an annual
  health-insurance reserve (added to spend — matters pre-Medicare), and
  essential annual spend. New optional `fire` block in the scenario schema
  (rides along in export/import). Pure helper `src/lib/simulator/fire.ts`
  with unit tests (60 total).

### Chart: nominal vs real comparison view

- **Added** a third projection mode, **对比 / Both**: the chart draws the
  nominal line (solid) and the real / today's-dollars line (dashed)
  together, with the gap between them shaded — a direct visual of the
  purchasing power lost to inflation. The tooltip shows both values and the
  gap; the caption explains the shaded area. The single 名义 / 实际 views are
  unchanged. Presentation only — no engine change.

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

[Unreleased]: https://github.com/tianyi-zhang-02/accretia/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tianyi-zhang-02/accretia/compare/02542b7...v1.0.0
