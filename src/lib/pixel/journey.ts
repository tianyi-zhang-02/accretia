/**
 * Pure layout for the "pixel journey" — the projection re-imagined as a tiny
 * side-scrolling world. No canvas here: this maps the engine's rows +
 * assumptions to (a) a normalized terrain profile and (b) a list of
 * landmarks, so the renderer stays dumb and this part stays unit-testable.
 *
 * Purely decorative: same numbers as the chart, nothing recomputed
 * differently — terrain follows REAL (today's-dollar) net worth so inflation
 * doesn't fake a mountain.
 */

import type { YearRow } from '@/lib/simulator/engine';
import { computeFire } from '@/lib/simulator/fire';
import type { Assumptions } from '@/lib/validation/scenarios';

export type LandmarkKind =
  | 'coast'
  | 'lean'
  | 'full'
  | 'goal'
  | 'home'
  | 'windfall'
  | 'expense'
  | 'crash'
  | 'car'
  | 'boat'
  | 'travel';

export type Landmark = {
  year: number;
  kind: LandmarkKind;
  /** House size for 'home': 1 = bungalow (~$1M), 2 = two-story, 3 = mansion ($5M+). */
  tier?: 1 | 2 | 3;
};

/** House sprite size by price — ~1M bungalow, ~3M two-story, 5M+ mansion. */
export function homeTier(price: number): 1 | 2 | 3 {
  if (price >= 5_000_000) return 3;
  if (price >= 1_500_000) return 2;
  return 1;
}

export type JourneyPoint = {
  year: number;
  /** Terrain height, 0..1 (0 = valley floor, 1 = highest peak). */
  h: number;
  /** Real (today's-dollar) net worth backing this column, for tooltips. */
  real: number;
};

export type Journey = {
  points: JourneyPoint[];
  landmarks: Landmark[];
  /** Job-loss stress window (clamped to the horizon) — drawn as overcast sky. */
  overcast: { fromYear: number; toYear: number } | null;
};

/**
 * Normalize the real-net-worth series into 0..1 heights. `sqrt` softens the
 * curve so early years aren't a dead-flat floor next to a compounding peak.
 * A flat series sits mid-height; negative values walk the valley floor.
 */
function terrainHeights(rows: YearRow[]): JourneyPoint[] {
  if (rows.length === 0) return [];
  const values = rows.map((r) => r.netWorthRealTodayDollars);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return rows.map((r, i) => {
    const v = values[i]!;
    const norm = max === min ? 0.5 : (v - min) / (max - min);
    return { year: r.year, h: Math.sqrt(Math.max(0, norm)), real: v };
  });
}

export function buildJourney(rows: YearRow[], a: Assumptions): Journey {
  const points = terrainHeights(rows);
  if (points.length === 0) return { points, landmarks: [], overcast: null };

  const firstYear = points[0]!.year;
  const lastYear = points[points.length - 1]!.year;
  const inRange = (y: number) => y >= firstYear && y <= lastYear;
  const landmarks: Landmark[] = [];

  // FIRE milestones — same inputs the FIRE panel uses.
  const fire = computeFire(rows, {
    recurringAnnualExpenses: a.recurringAnnualExpenses,
    safeWithdrawalRatePct: a.fire?.safeWithdrawalRatePct ?? 4,
    annualHealthInsurance: a.fire?.annualHealthInsurance ?? 0,
    essentialAnnualExpenses: a.fire?.essentialAnnualExpenses ?? a.recurringAnnualExpenses,
    returnPct: a.investment.returnPct,
    inflationPct: a.inflationPct,
    primaryBirthYear: a.people[0]?.birthYear ?? null,
  });
  if (fire.coast.reached && inRange(fire.coast.year!)) {
    landmarks.push({ year: fire.coast.year!, kind: 'coast' });
  }
  // Lean is only meaningful when it differs from full.
  if (fire.leanSpend < fire.fullSpend && fire.lean.reached && inRange(fire.lean.year!)) {
    landmarks.push({ year: fire.lean.year!, kind: 'lean' });
  }
  if (fire.full.reached && inRange(fire.full.year!)) {
    landmarks.push({ year: fire.full.year!, kind: 'full' });
  }

  // Goal-seek target: a flag at the target age's year.
  const primary = a.people[0];
  if (a.target && primary && inRange(primary.birthYear + a.target.age)) {
    landmarks.push({ year: primary.birthYear + a.target.age, kind: 'goal' });
  }

  if (a.mortgage && inRange(a.mortgage.purchaseYear)) {
    landmarks.push({
      year: a.mortgage.purchaseYear,
      kind: 'home',
      tier: homeTier(a.mortgage.homePrice),
    });
  }
  for (const w of a.windfalls) {
    if (inRange(w.year)) landmarks.push({ year: w.year, kind: 'windfall' });
  }
  for (const e of a.majorExpenses) {
    const y = 'year' in e ? e.year : e.startYear;
    if (!inRange(y)) continue;
    const amount = 'year' in e ? e.amount : e.annualAmount;
    // Flavor by category: a car, a SECOND home (sized by price), a yacht,
    // a plane for travel — everything else is a plain signpost.
    switch (e.kind) {
      case 'car':
        landmarks.push({ year: y, kind: 'car' });
        break;
      case 'house':
        landmarks.push({ year: y, kind: 'home', tier: homeTier(Math.abs(amount)) });
        break;
      case 'boat':
        landmarks.push({ year: y, kind: 'boat' });
        break;
      case 'travel':
        landmarks.push({ year: y, kind: 'travel' });
        break;
      default:
        landmarks.push({ year: y, kind: 'expense' });
    }
  }
  if (a.stress?.marketShock && inRange(a.stress.marketShock.year)) {
    landmarks.push({ year: a.stress.marketShock.year, kind: 'crash' });
  }

  // Job-loss stress → an overcast stretch of sky over the affected years.
  let overcast: Journey['overcast'] = null;
  const jl = a.stress?.jobLoss;
  if (jl) {
    const from = Math.max(firstYear, jl.startYear);
    const to = Math.min(lastYear, jl.startYear + jl.years - 1);
    if (from <= to) overcast = { fromYear: from, toYear: to };
  }

  landmarks.sort((x, y) => x.year - y.year);
  return { points, landmarks, overcast };
}
