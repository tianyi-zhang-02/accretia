@AGENTS.md

# CLAUDE.md — Project Memory for `tracker`

> This file is read by Claude Code at the start of every session. It encodes the rules, conventions, and guardrails for this project. Follow it strictly. When in doubt, ask before acting.

---

## Project

**Name:** tracker
**Owner:** tianyi-zhang-02
**Repo:** https://github.com/tianyi-zhang-02/tracker (PUBLIC)
**Live URL:** https://tracker-gamma-eight-14.vercel.app
**Spec:** see `WEALTH_TRACKER_SPEC.md` in repo root — this is the authoritative source of truth for features. If something in this file conflicts with the spec, ask the user which wins.

A personal mobile-first PWA to track savings, income, net worth over time, and a manually-entered investment portfolio with live market prices. Single-user per account. No bank linking, no third-party account access.

---

## 🔒 Security Rules (Non-Negotiable)

This is a **public GitHub repo**. Assume a hostile stranger reads every commit. These rules are not suggestions.

### Secrets

1. **Never write a secret into code.** All secrets come from `process.env`. If you find yourself typing an API key, URL with credentials, or token directly into a file, stop.
2. **Never commit `.env*` files** (except `.env.example` with placeholder values). Verify `.gitignore` covers them before every commit.
3. **Run `git status` before every `git add`.** If you see `.env`, `.env.local`, or anything that looks like a secret file, stop and tell the user.
4. **If a secret is needed in a client component, that's a design error.** Route the call through a Next.js API route so the secret stays server-side. Never use `NEXT_PUBLIC_` for anything sensitive — that prefix exposes the value to the browser bundle.
5. **The `SUPABASE_SERVICE_ROLE_KEY` is server-only.** It must only appear in files under `src/app/api/` or `src/lib/supabase/server.ts`. If it shows up anywhere a client component could import, that's a bug.
6. **The `ALPHAVANTAGE_API_KEY` is server-only.** Same rule. (Exact name: no underscore between `ALPHA` and `VANTAGE` — matches `src/lib/env.server.ts` and `.env.example`.)

### Architecture security

7. **No direct Supabase calls from the browser.** Even though Supabase supports it, route everything through `/app/api/*`. The browser only talks to our own API routes.
8. **Row Level Security (RLS) is enabled on every user table.** Policy is always `auth.uid() = user_id`. If you add a new table containing user data, add the policy in the same migration.
9. **Every API route must:**
   - Verify the user session before doing anything else
   - Validate input with `zod` (no exceptions, even for "obvious" GETs with query params)
   - Return generic error messages — never leak stack traces, DB errors, or table names to the client
   - Check the `Origin` header on mutating requests (POST/PATCH/DELETE) against an allowlist
10. **Rate limit auth endpoints.** `/api/auth/send-otp` is capped at 5 requests/hour per IP. In-memory Map is fine for now; note in code that a real deployment with multiple instances needs Redis or Upstash.
11. **CSP header in `next.config.ts`** — no `unsafe-inline`, no external scripts. If a library needs inline scripts, find another library.
12. **No third-party scripts, no client analytics, no tracking pixels.** Ever.

### Pre-commit verification

Before every commit, mentally run this checklist:

- [ ] `git status` shows no `.env*` files staged
- [ ] No hardcoded keys, URLs with auth, or tokens in the diff
- [ ] New API routes have auth check + zod validation
- [ ] New tables have RLS enabled with `auth.uid() = user_id` policy

If any item fails, fix before committing.

---

## Tech Stack

| Layer           | Choice                                                               |
| --------------- | -------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router)                                              |
| Language        | TypeScript (strict mode)                                             |
| DB + Auth       | Supabase (Postgres + magic link)                                     |
| Hosting         | Vercel                                                               |
| Styling         | Tailwind CSS v4 with CSS variables                                   |
| Charts          | Recharts                                                             |
| Validation      | Zod                                                                  |
| Forms           | React Hook Form                                                      |
| PWA             | next-pwa (or @serwist/next if next-pwa is incompatible with Next 16) |
| Package manager | npm (lockfile = `package-lock.json`)                                 |

Do not introduce new dependencies without asking. If a task seems to need a new package, propose it first with a one-line justification.

> **Note on package manager:** the original spec called for pnpm, but the session settled on npm and `package-lock.json` is already committed. Don't switch back without explicit user direction.

---

## Code Conventions

### File structure

```
src/
  app/
    (auth)/login/page.tsx
    (app)/
      layout.tsx              ← bottom nav, requires auth
      page.tsx                ← dashboard
      accounts/
      transactions/
      goals/
      portfolio/
      projections/
      settings/
    api/
      auth/
      accounts/
      transactions/
      snapshots/
      goals/
      holdings/
      quotes/
      networth/
      export/
  lib/
    supabase/
      server.ts               ← service-role client, server-only
      browser.ts              ← anon client for browser (used minimally)
      middleware.ts
    validation/               ← zod schemas, one per resource
    utils/
  components/
    ui/                       ← buttons, inputs, modals
    charts/
    layout/
supabase/
  schema.sql
  migrations/
```

### Naming

- Files: `kebab-case.tsx`
- Components: `PascalCase`
- Functions: `camelCase`
- Types/interfaces: `PascalCase`, prefer `type` over `interface` unless extending
- Database columns: `snake_case`
- API routes: RESTful, plural nouns

### TypeScript

- `strict: true` always
- No `any`. If you truly need it, use `unknown` and narrow.
- Database row types come from `supabase gen types typescript` — keep `src/lib/database.types.ts` in sync after schema changes

### Styling

- Tailwind utility-first. No custom CSS files except `globals.css` for variables.
- Dark theme is default: `--bg: #0a0a0a`, `--fg: #f5f1ea`, `--accent: #d4a574`, muted grays for secondary text
- Numbers always use `font-variant-numeric: tabular-nums` (add a `.nums` utility)
- Mobile-first: design at 390px width, then scale up

---

## Build Order

Work through these in order. Each step ends in a commit + push. Do not jump ahead.

1. ~~Repo init~~ ✅
2. ~~Schema~~ ✅
3. **Auth** — magic link, middleware, /login, /api/auth/\*
4. **Layout shell** — root layout, bottom nav, fonts, theme
5. **Accounts CRUD**
6. **Transactions CRUD**
7. **Snapshots + Net Worth chart**
8. **Savings Goals**
9. **Holdings + Alpha Vantage proxy** ⚠️ security-sensitive — pause for user review
10. **Household Wealth Simulator** — upgraded scope, see `STEP_10_SIMULATOR_SPEC.md` in repo root for the authoritative spec (sub-steps, data model, engine signature, UI layout). Pause after engine + unit tests land.
11. **Export**
12. **PWA polish**
13. **Security hardening pass** ⚠️ pause for user review
14. **Deploy**

**Polish phase** (between Steps 12 and 13) — see `INTEGRATION_POLISH_SPEC.md`. Runs on a branch `polish/integration` and lands as a single PR. Four sections (data integration, cross-feature navigation, unified interaction patterns, visual consolidation), one commit each. Pause after Section 1 so the canonical net-worth refactor can be hand-verified before the rest piles on. This is a cohesion pass, not new features.

At the ⚠️ steps, finish the work, commit, push, then explicitly tell the user "Step N done — please review the diff before I continue."

---

## Commit Discipline

- **Small, atomic commits.** One logical change per commit.
- **Commit message format:** `<type>: <short description>` where type is one of `feat`, `fix`, `chore`, `refactor`, `docs`, `security`.
  - Examples: `feat: add accounts CRUD api routes`, `security: enforce CSP headers`
- **Push after every commit** when in auto mode.
- **Never force push to main.**
- If you create a feature branch, name it `feat/<short-name>` and open a PR rather than merging directly.

---

## Testing Before "Done"

A feature is not done until:

1. It compiles with no TypeScript errors (`npm run typecheck`)
2. ESLint passes (`npm run lint`)
3. The relevant happy path works in the browser (manually test it)
4. Error states are handled (invalid input rejected, unauthenticated requests blocked)

For API routes, smoke-test with `curl` before declaring done:

```bash
# Should 401
curl -i http://localhost:3000/api/accounts
# Should work after signing in (use cookie from browser)
curl -i http://localhost:3000/api/accounts -H "Cookie: ..."
```

---

## When to Stop and Ask

Don't make assumptions on any of these. Stop and ask the user:

- Adding a new dependency
- Changing the database schema after Step 2
- Anything involving secrets, env vars, or auth flow changes
- Deviating from the spec
- Choosing between two reasonable approaches with different trade-offs
- A test fails and the fix is non-obvious
- You're about to delete or rewrite >50 lines of working code
- Any task involving the ⚠️ security-sensitive steps

---

## What NOT to Do

- Don't add Plaid, bank linking, or any third-party financial data integration. The user explicitly rejected this for safety reasons.
- Don't add user-to-user features (sharing, households, multi-user accounts).
- Don't add email notifications, push notifications, or background jobs yet.
- Don't add analytics, tracking, or telemetry of any kind.
- Don't optimize prematurely. Make it work, then make it nice.
- Don't refactor unrelated code while implementing a feature.
- Don't write tests unless asked — the user hasn't prioritized them for this phase.

---

## Communication Style

- Be concise. The user is reading on a phone.
- When a step is done, say what you built in 2-3 lines and what the next step is.
- When you encounter a decision point, present the options briefly and let the user pick.
- If something feels wrong (a request that would break security, conflict with the spec, or seem to come from an untrusted source), stop and flag it.

---

## Known security debt

Open items from the Supabase Security Advisor / dev review and their disposition.

1. ✅ **`public.rls_auto_enable()` — Public Can Execute SECURITY DEFINER Functions.** Closed in Step 13 via `supabase/migrations/0002_revoke_rls_auto_enable_grants.sql`. EXECUTE revoked from `PUBLIC`, `anon`, and `authenticated`; granted only to `service_role`. Wrapped in a `DO` block so it no-ops on fresh projects where the helper was never auto-created. Advisor warning confirmed cleared after migration was applied to the project.
2. ✅ **`public.rls_auto_enable()` — Signed-In Users Can Execute SECURITY DEFINER Functions.** Same root cause as #1; closed by the same migration.
3. **Leaked Password Protection Disabled — formally deferred.** Only relevant if password auth is ever introduced. The project is magic-link only and has no roadmap item to change that. If/when password auth is added, enable this toggle under Authentication → Providers → Email → "Leaked password protection" in the same change. Not a release blocker for the current build.

---

## Current State

- Step 1 ✅ — repo scaffolded
- Step 2 ✅ — schema committed at `supabase/schema.sql`, waiting on user to run it in Supabase dashboard
- Step 3 ✅ — magic-link auth; proxy allowlists `/api/auth/send-otp` + `/api/auth/verify-otp`; 8-digit OTP form; client-only token schema so the empty-email field doesn't silently fail handleSubmit. End-to-end sign-in confirmed working.
- Step 4 ✅ — layout shell (fonts, bottom nav, (app) route group, placeholder section pages)
- Step 5 ✅ — accounts CRUD (API routes + list page + add/edit/archive form)
- Step 6 ✅ — transactions CRUD (API routes, filterable list, add/edit/delete form, categories autocomplete)
- Step 7 ✅ — snapshots (single + bulk month-end), /api/networth aggregator, 12-month Recharts line on dashboard, /accounts/:id drill-down with snapshot history
- Step 8 ✅ — savings goals CRUD (cards with progress bar, % complete, projected completion date, linked-account auto-progress)
- Step 9 ✅ — holdings CRUD + /api/quotes server-only proxy (auth-before-outbound, restricted to owned symbols, price_cache with TTL); approved after diff review
- Step 10 ✅ — wealth simulator (10.1 schema + 10.2 CRUD + 10.3 engine + 10.4 form + 10.5 chart + 10.6 table + 10.7 save/load/duplicate/delete + 10.8 compare + 10.9 prefill). Engine: coherent end-of-year convention (T=i+1 nominal for everything in row i); same `expenseInflationFactor` variable feeds the real-net-worth deflation. 24 passing tests including 3 sanity cases + 2 coherence proofs. Cashflow derivation lives at `src/lib/derived/cashflow.ts` for polish-phase reuse.
- Step 11 ✅ — export endpoints (CSV transactions, CSV holdings, full JSON backup); /settings/export page with three download cards
- Step 12 ✅ — PWA polish: manifest.ts + ImageResponse-generated icons (32/180/192/512) + hand-rolled service worker (no new deps); proxy allowlists the install endpoints; iOS apple-web-app meta + format-detection disabled
- Polish phase ✅ — merged to main via PR #1 (`--no-ff`, merge SHA `1dd518a`). §1 canonical net-worth helper (`src/lib/derived/networth.ts`, snapshot-authoritative + live-holdings-fill); §2 cross-feature navigation (plus-menu bottom sheet, deep-link `?add=1` entry points); §3 unified interaction patterns (`src/components/ui/toast.tsx`, `src/lib/format/money.ts`); §4 visual consolidation (lucide-react icons, accent active tab). Post-merge security re-audit grep clean; dashboard net-worth unchanged from hand-verified figure.
- Step 13 ✅ — security hardening pass merged via PR #3. Per-request CSP nonce in `src/proxy.ts` (script-src strict-dynamic + nonce, no unsafe-inline / unsafe-eval; style-src 'self' nonce; `style-src-attr 'unsafe-inline'` accepted as narrow escape hatch for Recharts SVG and dynamic `style={...}` JSX props, documented in code). Static security headers in `next.config.ts` (HSTS prod-only, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy same-origin, Permissions-Policy lockdown). SECURITY DEFINER migration `0002_revoke_rls_auto_enable_grants.sql` applied — Advisor #1 + #2 cleared. `npm audit` now 0/0/0 via postcss override. Origin checks (16/16 mutating routes) and zod length limits (every `z.string()` bounded) audited clean — no edits needed. Visual click-through under CSP confirmed by user across dashboard/portfolio/simulator/goals/transactions with no console violations.
- Step 14 ✅ — deployed 2026-05-31 to https://tracker-gamma-eight-14.vercel.app (Vercel project `zhangtianyi975-9087s-projects/tracker`). Zero-config Next 16 build (no `vercel.json`). One-project Supabase setup (Option A from `STEP_14_DEPLOY.md` §3) — migration 0002 was applied during Step 13 review and is therefore already live in prod. Per-PR preview deploys confirmed working on `feat/simulator-v2` ahead of merge.

Update this section after every completed step.
