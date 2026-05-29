# Wealth Tracker — Build Specification

> **For:** Claude Code
> **Stack:** Next.js 16 (App Router) + Supabase + Vercel
> **Constraint:** Public GitHub repo. Assume hostile readers. No secrets, no exploitable surface area.

> **Note:** Original spec said Next.js 14 + pnpm; session settled on Next.js 16 + npm. `CLAUDE.md` is the authoritative deviation log.

---

## 0. North Star

A personal mobile-first PWA to track savings, income, net worth over time, and an investment portfolio with live prices. Single-user per account. Must feel like a private banking app, not a SaaS dashboard.

The user does **not** want to connect real brokerage accounts. All holdings are entered manually — the app just fetches public market prices to value them.

---

## 1. Security Model (Non-Negotiable)

This is a public repo, so the threat model is: **a stranger reads every line of code and tries to break in.**

### Rules

1. **No secrets in the repo, ever.** Use `.env.local` (gitignored) and Vercel environment variables. Commit a `.env.example` with placeholder keys only.
2. **No Supabase calls from the browser.** Even though Supabase is designed for client-side use with RLS, route everything through Next.js API routes (`/app/api/...`). This means:
   - The `SUPABASE_SERVICE_ROLE_KEY` lives only on the server
   - The browser never sees the database URL structure or table names
   - Rate limiting, validation, and auth checks happen server-side
3. **Row Level Security (RLS) enabled on every table** as defense-in-depth. Even if a service-role key leaks, policies enforce per-user access.
4. **Auth via Supabase magic link (email OTP)** — no passwords to leak, no OAuth providers to misconfigure. Add a rate limit on the send-OTP endpoint.
5. **All API routes**:
   - Verify the user's session before doing anything
   - Validate input with `zod`
   - Return generic error messages (no stack traces, no DB errors)
6. **Stock price API key** (Alpha Vantage) is server-side only. Browser hits `/api/quotes?symbols=...`, server proxies to Alpha Vantage. This prevents quota theft.
7. **Content Security Policy** header in `next.config.ts` — no inline scripts, no external script sources.
8. **CSRF protection** on all mutating routes via the `Origin` header check.
9. **No client-side analytics, no third-party scripts.** Period.
10. **Dependabot enabled** on the repo for security updates.

### Pre-commit checklist

- `gitleaks` or similar pre-commit hook to block accidental secret commits
- `.gitignore` covers `.env*`, `.next/`, `node_modules/`, `*.local`
- README has a "Setup" section with `.env.example` instructions

---

## 2. Tech Stack

| Layer      | Choice                          | Why                                   |
| ---------- | ------------------------------- | ------------------------------------- |
| Framework  | Next.js 16 (App Router)         | API routes + PWA + SSR in one         |
| Language   | TypeScript (strict)             | Catches bugs before users do          |
| DB + Auth  | Supabase (Postgres)             | Free tier, RLS, magic link auth       |
| Hosting    | Vercel                          | Zero-config Next.js, free tier        |
| Styling    | Tailwind CSS v4 + CSS variables | Mobile-first utility                  |
| Charts     | Recharts                        | React-native, lightweight             |
| Validation | Zod                             | Runtime + type-level safety           |
| Prices     | Alpha Vantage free tier         | 25 calls/day, then cache aggressively |
| PWA        | `next-pwa` (or `@serwist/next`) | Installable on phone home screen      |
| Forms      | React Hook Form                 | Minimal re-renders                    |

---

## 3. Data Model

All tables have `user_id uuid references auth.users not null` and RLS policy: `auth.uid() = user_id`.

### `accounts`

Where money sits — checking, savings, brokerage, crypto wallet, etc.

```
id uuid pk
user_id uuid
name text                    -- "Chase Savings", "Fidelity Brokerage"
type text                    -- 'cash' | 'savings' | 'brokerage' | 'retirement' | 'crypto' | 'other'
currency text default 'USD'
created_at timestamptz default now()
```

### `transactions`

Income and savings contributions. Keep it simple — not a full ledger.

```
id uuid pk
user_id uuid
account_id uuid references accounts
kind text                    -- 'income' | 'savings_deposit' | 'savings_withdrawal' | 'expense'
amount numeric(14,2)         -- always positive; kind determines sign
category text                -- 'salary', 'freelance', 'dividend', 'rent', 'groceries', etc.
note text
occurred_on date
created_at timestamptz default now()
```

### `savings_goals`

```
id uuid pk
user_id uuid
name text                    -- "Emergency fund", "House down payment"
target_amount numeric(14,2)
target_date date
monthly_contribution numeric(14,2)
linked_account_id uuid references accounts nullable
created_at timestamptz default now()
```

### `holdings`

Manually-tracked stock/ETF/crypto positions.

```
id uuid pk
user_id uuid
account_id uuid references accounts
symbol text                  -- 'VOO', 'AAPL', 'BTC-USD'
asset_type text              -- 'stock' | 'etf' | 'crypto'
quantity numeric(18,8)
cost_basis numeric(14,2)     -- total cost paid, not per-share
created_at timestamptz default now()
```

### `account_snapshots`

Monthly point-in-time balance snapshots — the foundation of the net-worth chart. Created manually or auto-prompted on the 1st of each month.

```
id uuid pk
user_id uuid
account_id uuid references accounts
balance numeric(14,2)
snapshot_date date
created_at timestamptz default now()
unique (account_id, snapshot_date)
```

### `price_cache` (server-only table, no RLS policies — service role only)

```
symbol text pk
price numeric(14,4)
currency text
fetched_at timestamptz
```

Used to avoid hammering Alpha Vantage. TTL: 1 hour for stocks during market hours, 24h otherwise.

---

## 4. Feature Specification

### 4.1 Auth Flow

- Landing page → "Sign in with email" → magic link sent → click link → app
- Session via Supabase SSR cookies (httpOnly, secure, sameSite=lax)
- Middleware redirects unauthenticated users to `/login`
- Sign out clears session server-side

### 4.2 Dashboard (`/`)

Top section — at-a-glance:

- **Total net worth** (sum of latest snapshot per account + holdings at current price)
- **Change this month** (delta vs previous month-end snapshot) with up/down arrow
- **Liquid cash** (sum of cash + savings account types)
- **Invested** (sum of brokerage + retirement + crypto at market value)

Middle — **Net worth chart** (12-month line chart from snapshots). Tap a point to see breakdown.

Bottom — recent transactions (last 10), with quick "+" button to add.

### 4.3 Accounts (`/accounts`)

- List all accounts with current balance (latest snapshot)
- Tap an account → drill into snapshot history + transactions for that account
- Add/edit/archive accounts (soft delete via `archived_at` column — don't hard delete, breaks history)
- Bulk "month-end update" flow: walks user through entering current balance for each non-investment account in one screen

### 4.4 Transactions (`/transactions`)

- Filterable list: date range, account, category, kind
- Add transaction modal: amount, kind, account, category, date, note
- Categories are free-text with autocomplete from past entries (server-suggested)
- Edit/delete with confirmation

### 4.5 Savings Goals (`/goals`)

- Cards showing each goal: progress bar, % complete, projected completion date based on current monthly contribution
- Tap → goal detail with editable target/date/contribution
- Linked account: shows current balance from snapshot, computes progress automatically

### 4.6 Portfolio (`/portfolio`)

- List holdings grouped by account
- Each row: symbol, quantity, current price, market value, total cost basis, unrealized P/L (% and $)
- Add/edit/sell holdings (selling decrements quantity; logs a transaction with kind=income if proceeds > cost)
- Top: portfolio total value, day change, all-time P/L
- Refresh button to fetch latest prices (rate-limited UI feedback)

### 4.7 Household Wealth Simulator (`/simulator`)

**Upgraded scope** — see `STEP_10_SIMULATOR_SPEC.md` in the repo root for the authoritative spec. Summary:

- Interactive scenario planner: two-person career models with multiple career stages, windfalls, major expenses, savings rate, taxes, inflation, investment-return bands.
- Scenarios are saved (`scenarios` table, jsonb assumptions) and named so the user can revisit and compare.
- Pure-math simulation engine in `src/lib/simulator/engine.ts` (no DB, no network) — runs client-side and is unit-testable.
- Career presets library (BigLaw, in-house, SWE, EM, medicine, etc.) to seed a stage.
- UI at `/simulator`: scenario selector, collapsible assumptions form, Recharts net-worth chart with low/high band, year-by-year table, compare mode (overlay 2–3 scenarios).
- Disclaimer baked in: estimates not advice; preset salaries are illustrative.

### 4.8 Export (`/settings/export`)

- Buttons: "Export transactions CSV", "Export holdings CSV", "Export full backup JSON"
- Server generates file, sends as download
- JSON backup is the canonical "your data is yours" escape hatch

### 4.9 Settings (`/settings`)

- Default currency
- Inflation assumption for projections
- Delete account (hard delete, cascades, confirmation required with email re-entry)
- Export data

---

## 5. API Routes (all under `/app/api/`)

Each route: auth check → zod validation → DB call → return.

```
POST   /api/auth/send-otp          { email }
POST   /api/auth/verify-otp        { email, token }
POST   /api/auth/signout

GET    /api/accounts
POST   /api/accounts               { name, type, currency }
PATCH  /api/accounts/:id           { name?, archived_at? }
DELETE /api/accounts/:id           (soft delete)

GET    /api/transactions           ?from=&to=&account=&kind=
POST   /api/transactions
PATCH  /api/transactions/:id
DELETE /api/transactions/:id

GET    /api/snapshots              ?account=&from=&to=
POST   /api/snapshots              { account_id, balance, snapshot_date }
POST   /api/snapshots/bulk         [{ account_id, balance }]   -- month-end flow

GET    /api/goals
POST   /api/goals
PATCH  /api/goals/:id
DELETE /api/goals/:id

GET    /api/holdings
POST   /api/holdings
PATCH  /api/holdings/:id
DELETE /api/holdings/:id

GET    /api/quotes?symbols=VOO,AAPL    -- proxies Alpha Vantage, uses price_cache

GET    /api/networth                   -- computed: snapshots + live portfolio value
GET    /api/projections?...            -- pure compute, no DB write

GET    /api/export/transactions.csv
GET    /api/export/holdings.csv
GET    /api/export/backup.json
```

---

## 6. UI / Design Direction

**Aesthetic:** Refined, editorial, monochrome with a single accent. Think _Financial Times_ meets _Linear_. Not crypto-bro neon, not pastel fintech.

- **Theme:** Dark by default, light mode toggle
- **Type:** A serif for numbers and headings (Fraunces, Newsreader, or similar). A clean grotesque for UI labels (no Inter — try Geist Mono for numbers, IBM Plex Sans for body)
- **Color:** Near-black background `#0a0a0a`, ivory text `#f5f1ea`, single accent — warm gold `#d4a574`
- **Numbers:** Tabular figures (`font-variant-numeric: tabular-nums`) everywhere. Numbers are the hero of this app — make them feel weighty.
- **Motion:** Subtle. Numbers count up on load. Page transitions are quick fades. No bouncy springs.
- **Layout:** Generous whitespace. Single column on mobile. Bottom nav bar with 5 icons: Dashboard / Accounts / + (add transaction, raised center button) / Portfolio / Settings
- **Charts:** Thin 1px lines, no chart-junk, axis labels in muted gray, hover state shows exact value with a vertical guide line

### PWA setup

- `manifest.json` with name, icons (192, 512), theme color matching bg
- Service worker via `next-pwa` (or `@serwist/next` if needed for Next 16) — cache shell offline, but always fetch fresh API data
- Apple touch icon for iOS install

---

## 7. Step-by-Step Build Order

Each step is committable.

1. **Repo init** — `create-next-app`, TypeScript strict, Tailwind, ESLint, Prettier, gitignore, `.env.example`, README skeleton
2. **Supabase setup** — create project (user does this manually), run schema migration, enable RLS with policies
3. **Auth** — magic link flow, middleware, login page, sign out
4. **Layout shell** — root layout, bottom nav, theme variables, font loading
5. **Accounts CRUD** — table, API routes, UI list + add/edit modal
6. **Transactions CRUD** — table, API, list with filters, add modal
7. **Snapshots + Net Worth chart** — bulk-update flow, dashboard chart
8. **Savings Goals** — CRUD + progress UI
9. **Holdings + Alpha Vantage proxy** — CRUD, price fetch with cache, portfolio screen
10. **Household Wealth Simulator** — see `STEP_10_SIMULATOR_SPEC.md`. Has its own sub-steps; pause after the engine + unit tests land so the math can be sanity-checked before the UI sits on top of it.
11. **Export** — CSV + JSON download endpoints
12. **PWA polish** — manifest, icons, service worker, lighthouse pass
13. **Security hardening pass** — CSP headers, rate limiting on auth, input length limits, README security notes
14. **Deploy** — Vercel hookup, env vars, custom domain optional

**Polish phase** (between Steps 12 and 13) — see `INTEGRATION_POLISH_SPEC.md`. Cohesion pass on a `polish/integration` branch, one PR, four commits (data integration → cross-links → interaction patterns → visual consolidation). Pause after data integration so the canonical net-worth refactor can be hand-verified.

---

## 8. Things to NOT Build (Scope Discipline)

- Multi-user / sharing / households
- Bank account linking (Plaid etc.) — defeats the safety goal
- Automated trade import
- Tax reporting
- Budgeting categories with limits — out of scope, add later if needed
- Notifications/email reminders — add later
- Mobile push notifications

---

## 9. Confirmed Decisions

- Accent color: warm gold `#d4a574`
- Default currency: USD
- Package manager: npm (overrode original pnpm)
- GitHub repo: `tianyi-zhang-02/tracker` (public)
- Domain: `*.vercel.app` for now
- Alpha Vantage + Supabase: user provisions during Step 2/3
