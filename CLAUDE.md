@AGENTS.md

# CLAUDE.md — Project Memory for Accretia

> Read this at the start of every session. It encodes the rules and guardrails for this project. Follow it strictly. When in doubt, ask before acting.

---

## What this is

**Accretia** is a **purely client-side** wealth-projection simulator. One page. Runs entirely in the browser. (The name is from _accretion_ — growth by gradual accumulation, i.e. compounding.)

**There is no backend, no database, no authentication, and nothing is stored or cached anywhere** — not on a server, not in `localStorage`, not in cookies. Scenarios live in React state; a refresh resets to a blank scenario. The only persistence is manual **Export / Import** of a scenario as a JSON file.

The repo was formerly a full net-worth tracker (Supabase + auth + accounts/transactions/holdings/portfolio). All of that was deliberately removed — the owner uses a real brokerage for tracking and wanted just the projection tool. The old code is preserved in git history; do not resurrect it.

**Live:** https://tracker-gamma-eight-14.vercel.app

---

## 🔒 The one hard rule: keep it client-only

Do not add, or propose without flagging loudly, any of:

- A backend, API route, database, or auth of any kind.
- Network requests to anything (no `fetch`, no third-party APIs, no analytics, no telemetry, no fonts/CDNs beyond what `next/font` self-hosts at build time).
- Persistent storage — no `localStorage`, `sessionStorage`, cookies, IndexedDB. Persistence is file export/import only.
- Environment variables / secrets. There are none, and there should be none.

If a requested feature seems to need any of the above, **stop and flag it** — it changes the entire nature of the project.

Untrusted input surface: **imported JSON files.** Always validate imported data against `assumptionsSchema` (`src/lib/validation/scenarios.ts`) before using it. Never `eval` or trust file contents.

Security posture (for such a simple app): strict CSP with per-request nonce in `src/proxy.ts` (no `unsafe-inline`/`unsafe-eval` for scripts; `connect-src 'self'`), plus static hardening headers in `next.config.ts`. Keep both.

---

## Tech stack

| Layer           | Choice                                       |
| --------------- | -------------------------------------------- |
| Framework       | Next.js 16 (App Router)                      |
| Language        | TypeScript (strict)                          |
| Styling         | Tailwind v4 (CSS variables in `globals.css`) |
| Charts          | Recharts                                     |
| Validation      | Zod                                          |
| Package manager | npm                                          |

Runtime deps are only: `next`, `react`, `react-dom`, `recharts`, `zod`. **Do not add dependencies without asking.** The whole point is a tiny, dependency-light, backend-free app.

---

## The engine is verified — don't break the math

`src/lib/simulator/engine.ts` is a pure deterministic function (`simulate(assumptions) → rows`). It has a carefully documented inflation convention (end-of-year, row `i` values nominal at T=i+1), eight enumerated simplifying assumptions, and lifestyle-creep modes. Key model rules: **savings is derived** (`saved = after-tax income − spending`; there is no savings-rate input — the implied rate is shown as an output), and **income includes salary + bonus + equity/RSUs**, all taxed at the flat effective rate. Role presets (`rolePresets.ts`) and a rough state+federal tax lookup (`tax-presets.ts`) are illustrative starting points the user overrides. The goal-seek solver (`goalSeek.ts`) works by **bisection over this engine**, not closed-form formulas.

All of this is covered by unit tests (`npm test`). If you change engine behavior, update the tests and re-verify against hand-computed cases. Don't silently alter the math.

---

## Code conventions

- Files: `kebab-case.tsx`. Components: `PascalCase`. Functions: `camelCase`. Types: `type` over `interface`.
- `strict: true`, no `any` (use `unknown` + narrow).
- Tailwind utility-first; dark theme by default (`--background`, `--foreground`, `--accent`, etc. in `globals.css`). Numbers use the `.nums` (tabular) utility.
- Mobile-first; centered in a `max-w-6xl` column. On large screens the editor is two columns (assumptions left, projection right); on mobile it stacks.

---

## Layout

```
src/
  app/
    page.tsx              server shell (await connection() for CSP nonce) → renders the client
    simulator-client.tsx  all UI state: scenarios, Projection/Assumptions/Compare tabs, export/import
    layout.tsx            fonts + globals + PWA registration
    manifest.ts, icon*.tsx, apple-icon.tsx
  proxy.ts                per-request CSP nonce (the only server-touching code)
  components/
    simulator/            assumptions-form, compare-view, goal-seek-panel, year-table, default-assumptions
    charts/simulator-chart.tsx
    pwa/sw-register.tsx
  lib/
    simulator/            engine, goalSeek, career-presets, rolePresets (+ tests)
    validation/scenarios.ts
    format/money.ts
```

UI is a live side-by-side editor: **Assumptions** (the form) on the left, **Projection** (final balance + chart + goal-seek) pinned on the right so edits update it in real time — with a scenario bar (select / name / duplicate / export / import / compare / remove) on top and the year-by-year table full-width below. **Compare** is a toggle in the scenario bar that swaps the editor for the compare view. On mobile it stacks (projection on top, assumptions below).

---

## Working discipline

- Small, atomic commits. Format: `<type>: <short description>` (`feat`, `fix`, `chore`, `refactor`, `docs`).
- Never force-push to main. Feature work goes on a branch → PR.
- A behavior-changing PR updates its docs in the same PR: `README.md`, `CHANGELOG.md`, and this file if a rule/structure changes.
- Before "done": `npm run typecheck`, `npm run lint`, `npm test` all pass, and the happy path works in the browser.

---

## Stop and ask

- Anything that would add a backend, storage, network call, dependency, or env var.
- Deleting or rewriting large amounts of working code.
- Changing the engine math.

---

## Current state

Purely client-side simulator, deployed to Vercel. No backend, no env vars, `npm audit` clean. Formerly a full tracker (see git history / older CHANGELOG entries); stripped to the simulator in the "simulator-only" change.
