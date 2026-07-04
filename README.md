# Tracker

A personal, mobile-first PWA. **Projection-first**: the home screen is a household wealth-projection simulator. Manual net-worth / portfolio tracking is still included but secondary — most people let a real brokerage handle day-to-day tracking and use this to answer "where does this go over the next 30 years?". Built for one user — no sharing, no bank linking, no analytics.

> Stack: Next.js 16 (App Router) · TypeScript · Supabase (Postgres + Auth) · Tailwind v4 · Recharts · Alpha Vantage (free tier) · Deployed on Vercel.

**Live (the original author's instance):** https://tracker-gamma-eight-14.vercel.app
**Try the simulator without an account:** https://tracker-gamma-eight-14.vercel.app/sim

---

## Features

### Wealth projection (the main event)

- **Home = the simulator (`/`).** Year-by-year household projection from your own assumptions. Multi-person careers with a searchable role library (legal + SWE/MLE), windfalls, major one-time + recurring expenses, lifestyle creep (flat or income-scaled), and goal-seek mode that solves four levers ("$X by age Y, what am I missing?"). Save / load / duplicate / compare scenarios. "Use my actual data" prefill can seed a scenario from any tracking data you keep. The bottom nav is projection-first: **Projection · Dashboard · [＋ new scenario] · Compare · Settings**.
- **Public simulator (`/sim`).** The same engine with all data wiring stripped — no login, nothing saved, JSON export only. Shareable with anyone.

### Tracking (optional, secondary — reachable via Settings)

- **Net-worth dashboard (`/dashboard`).** Hero net-worth figure, liquid vs. invested split, month-over-month delta, 12-month sparkline. All numbers come from one canonical helper — see [Architecture](#architecture) below.
- **Accounts.** CRUD for cash / savings / brokerage / retirement / crypto / other. Currency per account. Per-account balance shown with provenance tag (snapshot vs. live-holdings fill).
- **Transactions.** Income / expense / savings deposit / savings withdrawal. Filterable list, category autocomplete from prior entries.
- **Snapshots.** Per-account month-end balances. Single-account form + bulk month-end form. Drives the historical chart.
- **Savings goals.** Target amount, monthly contribution, optional target date, optional linked account. Progress bars + projected completion date.
- **Portfolio.** Holdings CRUD at the brokerage/retirement/crypto level. Tap "refresh prices" to fetch live Alpha Vantage quotes (server-side, rate-limited, cached). Unrealized gain/loss vs. cost basis.
- **Export.** Transactions CSV, holdings CSV, full JSON backup. The JSON backup supports optional **client-side AES-GCM encryption** with a passphrase that never leaves the browser (PBKDF2-SHA-256, 600k iterations).
- **PWA.** Installable on iOS + Android via "Add to Home Screen". Custom icons, offline shell, hand-rolled service worker (no third-party PWA libs).

### Public (no login)

- **`/sim`.** A standalone shareable Wealth Projection Simulator. Same engine as the authed `/simulator`, with the data wiring deliberately stripped: no saved scenarios, no "use my actual data" prefill, no link to the rest of the app. Friends can build projections, compare, and export JSON entirely client-side. The wall between this page and the private app is the entire risk surface of the public route — see `PUBLIC_SIM_AND_PRIVATE_FEATURES_SPEC.md` Workstream A.

---

## Security model

**This repo is public.** The threat model assumes a stranger reads every line of code and tries to break in. The codebase is structured around these invariants:

- **All database access is server-side.** The browser never imports the Supabase client; it talks to Next.js API routes under `/app/api/*`. The `SUPABASE_SERVICE_ROLE_KEY` lives only on the server.
- **Row Level Security is enabled on every user table** (`auth.uid() = user_id`) as defense in depth. `price_cache` enables RLS with no policies — only the service-role key can touch it.
- **Auth is magic link only** (Supabase email OTP, 8-digit codes). No passwords, no OAuth providers.
- **The Alpha Vantage key is server-only** (exact name: `ALPHAVANTAGE_API_KEY`, no underscore between `ALPHA` and `VANTAGE`). The browser hits `/api/quotes`; the server validates the user owns the requested symbols, then proxies and caches via the `price_cache` table to stay inside the free tier (25 calls/day).
- **Strict Content-Security-Policy** with per-request nonce: `script-src 'self' 'nonce-X' 'strict-dynamic'` (no `unsafe-inline`, no `unsafe-eval`). `style-src-attr 'unsafe-inline'` is the documented narrow escape hatch for Recharts SVG.
- **Origin-header CSRF checks** on every mutating route (16/16 audited).
- **zod validation** on every input. Every `z.string()` bounded by `.max() / .length() / .uuid() / .email() / .regex()`.
- **`npm audit` 0/0/0** as of Step 13. Maintained via the `postcss` override in `package.json`.
- **No third-party scripts, no client-side analytics, no telemetry.** Ever.
- **Pre-commit secret scanning** via `gitleaks` (run on every commit via a husky-managed hook in `.husky/pre-commit`). Requires `gitleaks` to be installed locally; the hook prints an install hint if not.

See `CLAUDE.md` for the full hard-rule list. Known security debt is tracked in the same file.

---

## Architecture

The pieces worth knowing about before reading code. For the full data-model reference (every table, RLS pattern, holdings ↔ holding_lots invariant), see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Canonical net-worth helper — `src/lib/derived/networth.ts`

**Single source of truth for "what is the user's net worth right now?".** Every UI surface that shows a net-worth number — dashboard hero, accounts-list total, `/api/networth` route, simulator's "Use my actual data" prefill, savings-goal progress — calls `computeNetWorth()`. If a new screen needs a balance figure, it MUST go through this helper. Inventing a parallel calculation is the kind of drift this file exists to prevent.

The holdings → net-worth model (resolved during the polish-pass §1 work):

- **Brokerage / retirement / crypto WITH a snapshot:** the snapshot wins. The user explicitly stated this account's value at a point in time; live holdings are informational on the portfolio page only.
- **Brokerage / retirement / crypto WITHOUT a snapshot but WITH holdings:** balance = `sum(quantity × live price)`. On Alpha Vantage failure (rate-limited, unknown symbol, etc.), falls back to cost basis for that holding so the account isn't silently zeroed.
- **Cash / savings / other:** snapshot wins, with 0 as fallback.

The helper returns a per-account `source` field (`'snapshot' | 'holdings' | 'none'`) so the UI can render the distinction. Historical 12-period series uses snapshots only — Alpha Vantage's free tier doesn't expose historical prices.

The file is `'server-only'` and lives outside `/api/*` so server components and API routes can both call it directly without an HTTP round-trip.

### Cashflow helper — `src/lib/derived/cashflow.ts`

Sibling to the net-worth helper. Aggregates transaction history into trailing baseline expenses + savings rate + months observed. Powers the simulator's "Use my actual data" prefill.

### Pure simulation engine — `src/lib/simulator/engine.ts`

`simulate(assumptions)` → year-by-year projection. Deterministic, no I/O, fully unit-tested (54 tests across engine + goalSeek + scenarios-demo + simulator-v2-demo). Documented inflation convention (end-of-year, all row-i values nominal at T=i+1), eight enumerated simplifying assumptions, lifestyle-creep modes that compose with the savings-rate cap without double-counting. The pure-function design is what lets `/sim` reuse the engine without touching any data layer.

### Proxy (Next.js 16 middleware) — `src/proxy.ts`

Per-request CSP nonce generation, public-path allowlist, Supabase session refresh. The public-path allowlist is **exact match only** — adding a `/` to widen a prefix would silently auto-public any future subpath.

---

## Setup

Looking to **run your own copy**? Follow **[SELF_HOSTING_GUIDE.md](./SELF_HOSTING_GUIDE.md)** for the end-to-end walkthrough. The TL;DR version below is for someone already familiar with the stack.

```bash
# 1. Clone & install (Node ≥ 20.19 enforced by package.json `engines.node`)
git clone https://github.com/<you>/tracker.git
cd tracker
npm install
# `npm install` triggers the `prepare` script, which sets up the husky
# pre-commit hook. Install gitleaks separately (`brew install gitleaks`
# on macOS) so the hook can actually scan; without it the hook prints
# a hint and lets the commit through.

# 2. Configure environment
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, ALPHAVANTAGE_API_KEY, NEXT_PUBLIC_APP_URL.

# 3. Apply DB schema + migrations
# In the Supabase SQL editor, run:
#   - supabase/schema.sql
#   - then every file in supabase/migrations/ in numerical order
# See supabase/migrations/README.md for what each migration does.

# 4. Configure Supabase Auth
# Site URL = http://localhost:3000 (or your prod URL)
# Redirect URLs include http://localhost:3000/auth/confirm
# Magic-link email template uses {{ .Token }} (NOT {{ .ConfirmationURL }}).

# 5. Run
npm run dev   # → http://localhost:3000
```

### Required environment variables

| Variable | Server-only? | Source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no (public) | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (public) | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase → Project Settings → API |
| `ALPHAVANTAGE_API_KEY` | **yes** | [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key) |
| `NEXT_PUBLIC_APP_URL` | no (public) | Your domain. Must match exactly (no trailing slash); used by the Origin CSRF check |

---

## Scripts

| Command                | What it does                         |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start dev server on `localhost:3000` |
| `npm run build`        | Production build                     |
| `npm run start`        | Run the production build             |
| `npm run lint`         | ESLint                               |
| `npm run typecheck`    | TypeScript type-check (no emit)      |
| `npm run test`         | Vitest (one-shot)                    |
| `npm run test:watch`   | Vitest (watch mode)                  |
| `npm run format`       | Prettier write                       |
| `npm run format:check` | Prettier check (CI-friendly)         |

---

## Deployment

Vercel: import the repo, set the same five env vars, deploy. Update Supabase's _Authentication → URL Configuration_ with the production domain so magic-link redirects work. No `vercel.json` required — Next 16 is a zero-config verified adapter on Vercel.

Full deploy operator runbook: [STEP_14_DEPLOY.md](./STEP_14_DEPLOY.md).

---

## Project documentation

| File | What it covers |
|---|---|
| [SELF_HOSTING_GUIDE.md](./SELF_HOSTING_GUIDE.md) | Step-by-step run-your-own-copy walkthrough. Includes troubleshooting. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full data model (every table + RLS pattern) and module map. |
| [CHANGELOG.md](./CHANGELOG.md) | Milestone-grouped history, dated, with merge SHAs where applicable. |
| [CLAUDE.md](./CLAUDE.md) | Hard-rule list + project memory. Read this before contributing. |
| [STEP_14_DEPLOY.md](./STEP_14_DEPLOY.md) | Operator runbook for deploying to Vercel. |
| [WEALTH_TRACKER_SPEC.md](./WEALTH_TRACKER_SPEC.md) | The original feature spec. Source of truth for behavior. |
| [STEP_10_SIMULATOR_SPEC.md](./STEP_10_SIMULATOR_SPEC.md) | Wealth-simulator spec (data model + engine + UI). |
| [INTEGRATION_POLISH_SPEC.md](./INTEGRATION_POLISH_SPEC.md) | Polish-pass spec — defines the canonical net-worth helper above. |
| [supabase/migrations/README.md](./supabase/migrations/README.md) | Migration apply-order + rules for adding new ones. |

---

## License

MIT — see [LICENSE](LICENSE).
