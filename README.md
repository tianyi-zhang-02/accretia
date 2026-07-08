# Accretia

**English** · [简体中文](README.zh-CN.md)

[![release](https://img.shields.io/github/v/release/tianyi-zhang-02/accretia)](https://github.com/tianyi-zhang-02/accretia/releases) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

_Watch your wealth accrete._ A single-page, **client-side** wealth-projection simulator. Project household net worth year by year from your own assumptions — careers, windfalls, major expenses, lifestyle creep, and low/mid/high return bands — and answer "what would it take to hit $X by age Y?".

Everything runs in the browser. **There is no backend, no database, no account, and nothing is stored or sent anywhere.** Refresh and you start clean; use Export / Import to keep a scenario as a JSON file.

> Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts · Zod. No environment variables. No server.

**Live:** https://tracker-gamma-eight-14.vercel.app

---

## Features

**Model your situation**

- **Year-by-year projection** from a pure, deterministic, unit-tested engine (documented inflation convention, low/mid/high return bands).
- **Careers with equity** — multiple people and career stages, each with base salary, bonus, and **annual equity / RSU comp**. A browsable, searchable, bilingual **role library** — tech (L3–L7), medicine, law, finance — provides illustrative starting numbers.
- **Derived savings** — no savings-rate knob: each year you save whatever's left of after-tax income after spending; the implied rate is shown as an output.
- **Tax presets** — a rough state + federal effective-rate estimate (all 50 states + DC), fully editable.
- **Home & mortgage what-if** — adds the home as an asset and the mortgage as a liability: down payment → equity, interest / property tax / maintenance as costs, principal builds equity, the home appreciates. Shows the monthly P&I.
- **Asset-mix return calculator** — blend a return from stocks, high-yield savings, bonds, and real estate (net of carrying costs like property tax), and apply it to the return band.
- **Windfalls, major expenses, lifestyle creep.**

**Answer questions**

- **FIRE** — the year work becomes optional: **Full / Lean / Coast**, with a health-insurance reserve.
- **Goal-seek** — set "$5M by 50" and it solves four levers (save more, higher return, spend less, more time) by bisection over the engine.
- **Monte Carlo** — a **Deterministic ⇄ Probabilistic** switch: 1,000 seeded market paths → a p10 / p50 / p90 fan and your **success probability**.
- **Stress test** — job-loss and market-crash what-ifs (the dent, the trough, whether you recover).
- **Nominal vs. real** (inflation-adjusted), including a shaded "gap" view; **Compare** scenarios; year-by-year table.

**Use it your way**

- **100% client-side** — nothing stored or sent. **Export / Import** a scenario as JSON is the only persistence.
- **Bilingual** (English / 简体中文, native — not machine-translated), **light/dark theme**, **font zoom**, and **simple by default** with an "advanced tools" toggle.
- **Installable PWA**, works offline.

The layout is a **live side-by-side editor**: assumptions on the left, the projection (final balance + chart + advanced tools) pinned on the right, so editing an assumption updates the chart in real time. On mobile it stacks (projection on top).

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
| `npm test`                           | Vitest — engine, FIRE, Monte Carlo, mortgage, stress, goal-seek |
| `npm run format`                     | Prettier                               |

---

## Architecture

Tiny by design.

```
src/
  app/
    page.tsx              the app: renders the simulator client
    simulator-client.tsx  all UI state (scenarios, live editor, export/import)
    layout.tsx            fonts + globals + PWA registration
    manifest.ts, icon*.tsx, apple-icon.tsx   PWA assets
  proxy.ts                per-request CSP nonce (the only "server" code)
  components/
    simulator/            assumptions form, compare, goal-seek, FIRE, stress, year table
    charts/               projection chart + Monte-Carlo fan
    i18n/lang-switch.tsx  EN · 中文 toggle
    pwa/sw-register.tsx
  lib/
    simulator/            engine + goal-seek + Monte-Carlo + FIRE + presets (+ tests)
    i18n/                 EN/中文 message catalog + locale provider
    validation/scenarios.ts   the Zod schema the engine reads
    format/money.ts
```

The **engine** (`src/lib/simulator/engine.ts`) is a pure function: `simulate(assumptions) → year rows` — no I/O. Everything else layers on top of it additively: goal-seek by bisection, FIRE, the Monte-Carlo runner, and the stress overlay all reuse the same math, and a home/mortgage adds a home asset + liability to net worth when present. It's all covered by unit tests (`npm test`) — including regressions that pin "no mortgage / zero volatility = the plain projection, exactly."

## License

MIT — see [LICENSE](LICENSE).
