# Work Optional

**English** · [简体中文](README.zh-CN.md)

[![release](https://img.shields.io/github/v/release/tianyi-zhang-02/accretia)](https://github.com/tianyi-zhang-02/accretia/releases) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> **On the two names:** the app calls itself **Work Optional** — that's what it tells you, and what people see. The repo and the site keep the original **Accretia** (from _accretion_: growth by accumulation), because a US wealth-management firm already trades as Work Optional and we're not competing for that ground.

_Find out when work becomes optional — and keep track of whether you're getting there._ A single-page, **client-side** app with three sections: **Track** (the home screen: a one-minute monthly check-in — money in, money out, net worth — with **money out as one total or split across ten categories** (mortgage/rent, insurance, food…), answered on the spot with "you kept $X; your plan expected $Y", an *Am I on track?* card holding your real net worth against the plan, and a printable year report), **Plan** (the wealth-projection simulator) and **Data** (backup, restore, optional encrypted sync). The projection is the yardstick; tracking is the habit.

In **Plan**, project net worth year by year from your own assumptions — careers, windfalls, major expenses, lifestyle creep, and low/mid/high return bands — and answer "what would it take to hit $X by age Y?".

Everything runs in the browser, and **by default nothing is ever sent anywhere — no account needed.** A deployment can optionally enable **sign-in with end-to-end-encrypted sync**: your data is encrypted on your device with a passphrase only you know, so the server (and whoever runs it) stores ciphertext it cannot read. See [`docs/cloud-setup.md`](docs/cloud-setup.md). Your plan — and your monthly ledger, if you keep one — stay on your own device (this browser's local storage) so they're still there tomorrow — untick **"Save on this device"** to keep it memory-only. For the long haul, **Back up everything** downloads one file with every plan and every ledger month; **Restore** brings it back on any device.

> Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts · Zod. No environment variables. No server.

**Live:** https://accretia.vercel.app

---

## Features

**Model your situation**

- **Year-by-year projection** from a pure, deterministic, unit-tested engine (documented inflation convention, low/mid/high return bands).
- **Careers with equity** — multiple people and career stages, each with base salary, bonus, and **annual equity / RSU comp**. A browsable, searchable, bilingual **role library** — tech (L3–L7), medicine, law, finance — provides illustrative starting numbers.
- **Derived savings, honest compounding** — no savings-rate knob: each year you keep whatever's left of after-tax income after spending. But bills come first — you choose the **share of that surplus you actually invest**; the rest stays as cash that counts in net worth yet earns nothing. Only invested money compounds.
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

- **Pixel journey** 🕹 — your projection as a tiny living pixel world: terrain follows your real net worth, milestones become landmarks (FIRE house, goal flag, treasure chests, a storm on crash years), and a little walker — trailed by a cat — crosses the horizon under a sun–moon cycle. Procedural canvas, zero images, zero libraries.
- **100% client-side** — nothing stored or sent. **Export / Import** a scenario as JSON is the only persistence.
- **Bilingual** (English / 简体中文, native — not machine-translated), **light/dark theme**, **font zoom**, and **simple by default** with an "advanced tools" toggle.
- **Installable PWA**, works offline.

Navigation is three sections — **Track · Plan · Data** — a segmented control on desktop and a bottom tab bar on phones. **Plan** is a **live side-by-side editor**: assumptions on the left, the projection (final balance + chart + advanced tools) pinned on the right, so editing an assumption updates the chart in real time. On mobile it stacks (projection on top).

---

## Privacy & security

Because the app has no backend, the security model is trivial:

- **Nothing leaves your device.** No API calls, no analytics, no telemetry, no cookies. Open DevTools → Network and you'll see the page load and nothing else.
- **Stored on your device, never anywhere else.** **"Save on this device"** keeps your scenarios in this browser's `localStorage` — on your device only, never sent anywhere, validated on load like any untrusted input, and erased the moment you untick it. Untick it and the app runs memory-only, exactly as before.
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
