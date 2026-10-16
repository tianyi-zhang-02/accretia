# Developing Work Optional

The app's rules and design notes live in [`CLAUDE.md`](../CLAUDE.md); this is the short version.

## Run it

```bash
git clone https://github.com/tianyi-zhang-02/accretia.git
cd accretia
npm install
npm run dev     # → http://localhost:3000
```

Node 22 (see `.nvmrc`). No environment variables are needed — sync stays off unless a deployment switches it on ([`cloud-setup.md`](cloud-setup.md)). Deploys anywhere that runs Next.js.

## Scripts

| Command                              | What it does                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm run dev`                        | Dev server on `localhost:3000`                                                            |
| `npm run build` / `npm run start`    | Production build / serve                                                                  |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                                                                       |
| `npm test`                           | Vitest — engine, ledger, tax tables, crypto, the MCP server, and the isolation rules      |
| `npm run format`                     | Prettier                                                                                  |
| `npm run screenshots`                | Rebuild the README pictures and the hero animation from sample data (needs Google Chrome) |

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Recharts · Zod. Runtime dependencies stop there, plus `@supabase/supabase-js`, loaded only when sync is switched on.

## How it fits together

```
src/
  app/simulator-client.tsx   the one page: Track · Plan · Data, all UI state
  components/ledger/         check-in, on-track, budgets & goals, year report & review
  components/simulator/      plan summary, assumptions, paycheck calculator
  lib/simulator/             the engine — a pure function, simulate(assumptions) → year rows
  lib/ledger/                months, CSV, reports, budgets, goals, allowance (pure, tested)
  lib/tax/                   paycheck tax tables (hand-computed tests)
  lib/cloud/                 E2EE crypto + the only network module
  lib/demo/                  the seeded sample household behind /?demo
  lib/i18n/                  English / 简体中文
mcp/                         the Claude / Codex extension (its own package)
```

The engine has no I/O; goal-seek (bisection), FIRE, Monte Carlo and stress tests all reuse it. `src/lib/isolation.test.ts` pins the privacy rules — no new network calls, storage keys, env vars or cookies — and runs in CI on every pull request.
