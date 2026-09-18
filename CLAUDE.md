@AGENTS.md

# CLAUDE.md — Project Memory for Work Optional

> Read this at the start of every session. It encodes the rules and guardrails for this project. Follow it strictly. When in doubt, ask before acting.

---

## What this is

**Work Optional** is a **purely client-side** wealth-projection simulator. One page. Runs entirely in the browser.

**Two names, on purpose — do not "fix" this.** The APP is **Work Optional** (page `<title>`, PWA manifest, in-app header, `package.json`): it's the product's own headline — it tells you the year work becomes optional. The REPO and the DEPLOYED SITE stay **Accretia** (`accretia.vercel.app`, from _accretion_: growth by accumulation), because a long-established US wealth-management firm already trades as Work Optional and owns workoptional.com; we deliberately don't compete for that ground.

**There is no backend, no database, no authentication, and nothing is ever sent anywhere** — no server, no network calls, no cookies. Scenarios live in React state, mirrored to ONE `localStorage` key on the user's own device (`workoptional:saved:v1`) so the app behaves like an app across visits; the **"Save on this device"** checkbox is on by default and unticking it erases the key immediately. Beyond that, persistence is manual **Export / Import** of a scenario as a JSON file.

The repo was formerly a full net-worth tracker (Supabase + auth + accounts/transactions/holdings/portfolio). All of that was deliberately removed — the owner uses a real brokerage for tracking and wanted just the projection tool. The old code is preserved in git history; do not resurrect it.

**Live:** https://accretia.vercel.app

---

## 🔒 The one hard rule: keep it client-only

Do not add, or propose without flagging loudly, any of:

- A backend, API route, database, or auth of any kind.
- Network requests to anything (no `fetch`, no third-party APIs, no analytics, no telemetry, no fonts/CDNs beyond what `next/font` self-hosts at build time).
- Persistent storage — no `sessionStorage`, cookies, or IndexedDB. Persistence is file export/import, plus ONE owner-approved exception: the "Save on this device" toggle (`localStorage` key `workoptional:saved:v1`, **default ON** since v1.2, validated on load, erased on untick). Any storage beyond that key still requires flagging. Note the write gate: nothing may be written until the restore attempt finishes, or the default scenario clobbers a saved session.
- Environment variables / secrets. There are none, and there should be none.

If a requested feature seems to need any of the above, **stop and flag it** — it changes the entire nature of the project.

Untrusted input surface: **imported JSON files.** Always validate imported data against `assumptionsSchema` (`src/lib/validation/scenarios.ts`) before using it. Never `eval` or trust file contents.

Security posture (for such a simple app): strict CSP with per-request nonce in `src/proxy.ts` (no `unsafe-inline`/`unsafe-eval` for scripts; `connect-src 'self'`), plus static hardening headers in `next.config.ts`. Keep both.

**Known non-issue — don't chase it.** In `next dev` the console fills with `Applying inline style violates ... 'style-src'`. This is Next's own dev overlay injecting a `@font-face{font-family:'__nextjs-Geist'}` `<style>` element without our nonce. Verified: element-`.style` writes (which is all Recharts does, to measure text) are permitted by `style-src-attr 'unsafe-inline'`, and a production server serves **zero** `<style>` tags and no overlay — so the violation does not exist in production. Do not relax `style-src` to silence it.

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

**Node runtime: 22 (see `.nvmrc`); Next 16 needs ≥20.19.** On this Mac `/opt/anaconda3/bin/node` (20.12) can shadow `/usr/local/bin/node` (22) on PATH; `npm run build` then dies with a cryptic `Unexpected token 'export'` from a mis-compiled `next.config`. A `prebuild` guard now fails fast with the real reason. Separately, if `node_modules/@next/swc-darwin-arm64/` exists but has no `.node` file, Turbopack falls back to WASM and refuses to build — `npm install` with the right Node restores it (no dependency changes).

Runtime deps are only: `next`, `react`, `react-dom`, `recharts`, `zod`. **Do not add dependencies without asking.** The whole point is a tiny, dependency-light, backend-free app.

---

## The engine is verified — don't break the math

`src/lib/simulator/engine.ts` is a pure deterministic function (`simulate(assumptions) → rows`). It has a carefully documented inflation convention (end-of-year, row `i` values nominal at T=i+1), enumerated simplifying assumptions, and lifestyle-creep modes. Key model rules: **savings is derived** (`saved = after-tax income − spending`; no savings-rate input — the implied rate is an output); **income includes salary + bonus + equity/RSUs**, all taxed at the flat effective rate; and the model is **two-pool** — only the invested pool (seeded by `startingInvested`, fed by `investedSharePct` of each year's surplus) earns the return, while the rest of net worth sits as cash earning nothing; shortfalls and housing costs draw cash first. FIRE milestones use investable (ex-home-equity) real net worth. **Retirement phase**: each person's career income stops at their optional `retireAge`; from the primary person's retirement, `retirement.spendingPct` scales baseline spending and `retirement.postReturnPct` replaces the base return (band keeps its spread); `otherIncomes[]` (social security / pension / rental) pay from a start age, inflation-adjusted by default, taxed like income. Role presets (`rolePresets.ts`) and a rough state+federal tax lookup (`tax-presets.ts`) are illustrative starting points the user overrides. The goal-seek solver (`goalSeek.ts`) works by **bisection over this engine**, not closed-form formulas.

All of this is covered by unit tests (`npm test`). If you change engine behavior, update the tests and re-verify against hand-computed cases. Don't silently alter the math.

---

## Code conventions

- Files: `kebab-case.tsx`. Components: `PascalCase`. Functions: `camelCase`. Types: `type` over `interface`.
- `strict: true`, no `any` (use `unknown` + narrow).
- Tailwind utility-first, but **chrome goes through the component layer in `globals.css`, not ad-hoc utilities**: `.card` / `.card-tight`, `.rows` + `.row` (hairline between siblings), `.rule`, `.btn` / `.btn-primary` / `.btn-ghost`, `.field`, `.eyebrow`, `.figure`. Depth is **surface + space, never a border** — `--surface` / `--surface-2` / `--hairline`. The UI previously had 83 borders, 12 padding values and boxes inside boxes; if you find yourself writing `rounded border p-3` again, use `.card` instead. Numbers use `.nums` (tabular); hero figures use `.figure`.
- Dark theme by default (`--background`, `--foreground`, `--accent`, etc. in `globals.css`).
- Mobile-first; centered in a `max-w-6xl` column. On large screens the editor is two columns (assumptions left, projection right); on mobile it stacks.
- **i18n**: the app is bilingual (English / 简体中文). All user-facing copy goes through `src/lib/i18n/messages.ts` via `useI18n()` — **never hard-code a display string**; add every new key to both `en` and `zh` (the `Messages` type makes a missing zh key a compile error), and write the Chinese natively, not as a literal translation. Locale is the `?lang` URL param (no storage). Currency stays USD. Keep `README.zh-CN.md` in sync when the README changes.

---

## Layout

```
src/
  app/
    page.tsx              server shell (await connection() for CSP nonce) → renders the client
    simulator-client.tsx  all UI state: scenarios, live side-by-side editor, export/import; wraps everything in the i18n LocaleProvider
    layout.tsx            fonts + globals + PWA registration
    manifest.ts, icon*.tsx, apple-icon.tsx
  proxy.ts                per-request CSP nonce (the only server-touching code)
  components/
    agent/                guided-setup (4-question onboarding), insights-panel, pixel-guide — the LOCAL agent: no LLM, no network
    simulator/            assumptions-form, compare-view, goal-seek-panel, year-table, default-assumptions
    charts/simulator-chart.tsx
    i18n/lang-switch.tsx  EN · 中文 toggle
    pwa/sw-register.tsx
  lib/
    simulator/            engine, goalSeek, insights (perturb-the-engine findings), career-presets, rolePresets (+ tests)
    i18n/                 messages.ts (EN/中文 catalog) + locale.tsx (LocaleProvider/useI18n)
    validation/scenarios.ts
    format/money.ts
```

**Single-person app.** The guided setup builds one person and the form offers no "+ Add person" — a two-earner household needs its own tax treatment, retirement timing and income-merging rule, and a flat rate over both produced confident nonsense. The engine and schema still *accept* multi-person files (imports from the two-person era restore fine, and "Remove person" stays so they can be trimmed), but nothing in the UI creates one. Don't add it back without solving the modeling first.

UI is answer-first. The left column opens as a **plan summary** (`plan-summary.tsx`) — five inline-editable rows (age / income / spending / saved / retire age) — with the full eight-section `AssumptionsForm` behind an **All details** disclosure. That keeps a first load at ~3 visible inputs instead of 23; don't re-expand the form by default. Summary write-back stays conservative: rows that can't map to a single field (income for a multi-person or multi-stage household) go read-only rather than guessing.

Underneath it is still a live side-by-side editor: **Assumptions** (the form) on the left, **Projection** (final balance + chart + goal-seek) pinned on the right so edits update it in real time — with a scenario bar (select / name / duplicate / export / import / compare / remove) on top and the year-by-year table full-width below. **Compare** is a toggle in the scenario bar that swaps the editor for the compare view. On mobile it stacks (projection on top, assumptions below).

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
