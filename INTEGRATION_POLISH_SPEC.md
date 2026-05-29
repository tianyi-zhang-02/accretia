# Integration & Design Polish Pass

> Runs **after Steps 10–12 are built** and after the core data features (accounts, transactions, snapshots, goals, holdings) are functionally verified. This is a **cohesion pass, not new features** — it connects and refines what exists.
>
> Do it on a branch `polish/integration` and open a PR so the whole thing is reviewable in one diff.

---

## The goal

Right now the app is a set of correct-but-separate screens. This pass makes it feel like one product: data flows between features, screens cross-link, interactions are consistent, and the visual language is unified. Nothing here adds a new capability.

Work through the four sections in order. Commit each section separately so it's reviewable.

---

## 1. Data integration — one source of truth

The features currently compute things in isolation. Unify them.

- **Net worth is computed in exactly one place.** A single server function (`/api/networth` or a shared `lib/networth.ts`) returns the canonical total = latest snapshot per account + live market value of holdings. The dashboard, the accounts list total, and the simulator's "starting net worth" prefill all call this same function. No screen should compute net worth its own way — that's how two screens end up disagreeing.
- **Holdings value flows into net worth automatically.** A brokerage account's "balance" on the dashboard should reflect its holdings at live prices, not a stale manual snapshot — or at minimum, the app should show both and make clear which is which. Decide one model and apply it everywhere.
- **Savings-rate and expense figures are derived once.** The simulator's "use my actual data" prefill and any dashboard "you saved $X this month" stat pull from the same `lib/derived/cashflow.ts` helper that reads transactions. One definition of "monthly savings," used everywhere.
- **Goals read live account balances.** A goal linked to an account shows progress from the same balance the accounts screen shows — not a cached copy.

**Test:** change one account's balance, and every screen that references it (dashboard, accounts, a linked goal, the simulator prefill) reflects the change consistently.

---

## 2. Cross-feature navigation — make everything tappable

Today each screen is an island. Wire them together so the natural next action is always one tap away.

- **Account → its detail** already exists. From the account detail, link each transaction row to the transaction editor, and each holding (if a brokerage account) to the portfolio.
- **Holding → its account.** From a portfolio row, tap to see which account it sits in and that account's full picture.
- **Dashboard tiles are links.** "Liquid cash" tile → filtered accounts view (cash + savings). "Invested" tile → portfolio. "This month" delta → transactions filtered to this month. The net-worth chart point → a breakdown for that month.
- **Goal → linked account.** Tap a goal's progress to jump to the account funding it.
- **Transaction with a dividend/investment category → related holding** (nice-to-have, only if clean).
- **Global "+" is context-aware.** The raised center "+" in the bottom nav opens a small menu: Add transaction / Add holding / Add account / Update balances — so any "add" is reachable from anywhere, not just from the relevant screen.

**Test:** starting from the dashboard, you can reach any piece of underlying data in one or two taps, and every number you see can be drilled into.

---

## 3. Unified interaction patterns

Pick one pattern for each interaction and apply it across every screen. Inconsistency here is what makes an app feel amateur.

- **Add/edit:** one shared form pattern (same modal-or-page convention, same field layout, same primary-button placement) for accounts, transactions, holdings, goals.
- **Delete/archive:** one confirmation pattern everywhere, with the same wording style and an undo toast where feasible.
- **Toasts:** one toast system for success/error. Every mutation (add, edit, delete, save snapshot, refresh prices) gives the same style of feedback. No silent successes, no raw error strings.
- **Loading:** one skeleton/spinner convention. Price fetches, list loads, and chart renders all use it. Show skeletons for structure, not full-screen blockers (per the data-loads-progressively principle).
- **Empty states:** every list (accounts, transactions, goals, holdings) has a designed empty state with a one-line explanation and the primary "add" action — never a blank screen.
- **Numbers:** one formatting helper (`lib/format/money.ts`, `formatPct`, `formatDelta`) used everywhere. Currency, signs (+/−), percentages, and color (positive/negative/muted) are identical across screens. Tabular nums everywhere.

**Test:** a screenshot of any two screens looks like they came from the same app.

---

## 4. Visual design consolidation

Apply the design tokens already in `CLAUDE.md` consistently, and raise the bar from "functional" to "considered."

- **Tokens, not magic values.** All colors, spacing, radii, and type sizes come from CSS variables / a Tailwind config — no one-off hex codes or pixel values scattered in components. Background `#0a0a0a`, ivory text, single warm-gold accent, muted grays for secondary.
- **Type hierarchy.** Numbers are the hero — large, serif (Fraunces/Newsreader), tabular. Labels and body in the clean sans (IBM Plex Sans). Consistent scale; no random font sizes.
- **Spacing rhythm.** One spacing scale. Generous whitespace, single column on mobile, consistent card padding and gaps.
- **Charts.** Thin 1px lines, muted gridlines, no chart-junk, accent-colored series, hover guide line with exact value. The net-worth chart and the simulator chart share a chart component so they look identical.
- **Motion, subtle.** Numbers count up on load. Page transitions are quick fades. Toasts slide in. No bouncy springs, nothing that delays interaction.
- **Bottom nav.** Five items, raised center "+", active state in accent, consistent icons (one icon set throughout — likely `lucide-react`).
- **Dark/light.** If light mode exists, every token has both values and every screen is checked in both.

**Test:** it looks like a private-banking app someone designed on purpose — not a dashboard template.

---

## Constraints (don't break these while polishing)

- **No security regressions.** Don't move server-only code (the Alpha Vantage key, service-role client) into client components for the sake of a UI change. The Step 9 guarantees stay intact — re-run the `.next/static` key-leak grep after this pass.
- **No new browser storage.** Keep using server/DB state; don't introduce `localStorage`.
- **Don't change the data model** unless a specific integration genuinely requires it — and if so, stop and ask first (per `CLAUDE.md`).
- **Performance.** The live-price refresh and net-worth computation shouldn't fire redundantly. Debounce, cache, and reuse the single source-of-truth function.

---

## Build approach

1. Branch `polish/integration`.
2. Section 1 (data integration) → commit. This is the riskiest; verify net worth still matches hand-math afterward.
3. Section 2 (cross-links) → commit.
4. Section 3 (interaction patterns) → commit.
5. Section 4 (visual consolidation) → commit.
6. Re-run the security grep and a full click-through on mobile width (390px).
7. Open a PR. Pause for review before merging to `main`.

**Pause after Section 1 specifically** — if net worth computation gets refactored, the user wants to re-verify the number against their own math before more changes pile on.
