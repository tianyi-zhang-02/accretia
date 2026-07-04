# Accretia

_Watch your wealth accrete._ A single-page, **client-side** wealth-projection simulator. Project household net worth year by year from your own assumptions — careers, windfalls, major expenses, lifestyle creep, and low/mid/high return bands — and answer "what would it take to hit $X by age Y?".

Everything runs in the browser. **There is no backend, no database, no account, and nothing is stored or sent anywhere.** Refresh and you start clean; use Export / Import to keep a scenario as a JSON file.

> Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts · Zod. No environment variables. No server.

**Live:** https://tracker-gamma-eight-14.vercel.app

---

## Features

- **Year-by-year projection** from a pure, deterministic engine (documented inflation convention, low/mid/high return bands).
- **Careers with equity** — multiple people and career stages, each with base salary, bonus, and **annual equity / RSU comp** (which dominates total pay for big-tech and AI-lab roles). A browsable, grouped, searchable **role library** (Legal · Software/ML) provides illustrative starting numbers.
- **Derived savings** — no savings-rate knob: each year you save whatever's left of after-tax income after spending. The implied savings rate is shown as an output.
- **Tax presets** — a rough state + federal effective-rate estimate (all 50 states + DC) seeds the single tax rate, fully editable. Illustrative, not tax advice; carries a "last reviewed" date.
- **Windfalls & major expenses** — one-time or recurring, plotted as markers on the chart.
- **Lifestyle creep** — model spending rising over time (flat drift above inflation, or absorbing a share of each raise).
- **Goal-seek** — set a target ("$5M by 50") and the simulator solves four levers (save more, higher return, spend less, more time) by bisection over the engine.
- **Compare** scenarios side by side.
- **Nominal / real** toggle, and a year-by-year table.
- **Export / Import** a scenario as JSON — the only form of persistence (nothing is stored automatically).
- **Installable PWA**, works offline (it's just static assets + client JS).

The layout is a **live side-by-side editor**: assumptions on the left, the projection (final balance + chart + goal-seek) pinned on the right, so editing an assumption updates the chart in real time. **Compare** is a toggle in the scenario bar. On mobile it stacks (projection on top).

---

## Privacy & security

Because the app has no backend, the security model is trivial:

- **Nothing leaves your device.** No API calls, no analytics, no telemetry, no cookies, no `localStorage`. Open DevTools → Network and you'll see the page load and nothing else.
- **No secrets, no environment variables.** There's nothing to leak.
- **Strict Content-Security-Policy** with a per-request nonce (`src/proxy.ts`): `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline`, no `unsafe-eval`), `connect-src 'self'`. Plus static hardening headers (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy) in `next.config.ts`.
- **Imported JSON is validated** against the engine's Zod schema before use, so a malformed file can't crash the projection.

---

## Run it yourself

No accounts, no database, no keys — just clone and go.

```bash
git clone https://github.com/tianyi-zhang-02/accretia.git
cd accretia
npm install
npm run dev     # → http://localhost:3000
```

Deploy anywhere that runs Next.js (Vercel: import the repo, deploy — no env vars to set).

## Scripts

| Command                              | What it does                           |
| ------------------------------------ | -------------------------------------- |
| `npm run dev`                        | Dev server on `localhost:3000`         |
| `npm run build` / `npm run start`    | Production build / serve               |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript check              |
| `npm test`                           | Vitest (engine + goal-seek unit tests) |
| `npm run format`                     | Prettier                               |

---

## Architecture

Tiny by design.

```
src/
  app/
    page.tsx              the app: renders the simulator client
    simulator-client.tsx  all UI state (scenarios, tabs, export/import)
    layout.tsx            fonts + globals + PWA registration
    manifest.ts, icon*.tsx, apple-icon.tsx   PWA assets
  proxy.ts                per-request CSP nonce (the only "server" code)
  components/
    simulator/            assumptions form, compare, goal-seek panel, year table
    charts/simulator-chart.tsx
    pwa/sw-register.tsx
  lib/
    simulator/            pure engine + goal-seek solver + presets (+ tests)
    validation/scenarios.ts   the Zod schema the engine reads
    format/money.ts
```

The **engine** (`src/lib/simulator/engine.ts`) is a pure function: `simulate(assumptions) → year rows`. No I/O. It's the same math whether you're editing, comparing, or goal-seeking, and it's covered by unit tests (`npm test`).

## License

MIT — see [LICENSE](LICENSE).
